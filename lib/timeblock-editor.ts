import { z } from "zod";
import { parsePhoenixLocalDateTime } from "@/lib/time";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import {
  type TimeblockRoutine,
  timeblockRoutineSchema,
} from "@/lib/timeblock-routine";
import { timeblockWeek } from "@/lib/timeblocks";

export const blockEditSchema = z.object({
  summary: z.string().min(1).max(240),
  upserts: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(100)
          .describe("Existing ID to edit; a new unique manual- ID to add."),
        title: z.string().trim().min(1).max(160),
        startedAt: z.string().describe("Phoenix local YYYY-MM-DDTHH:mm"),
        completedAt: z.string().describe("Phoenix local YYYY-MM-DDTHH:mm"),
        included: z.boolean(),
      }),
    )
    .max(56),
  removeIds: z.array(z.string().max(100)).max(56),
});
export type BlockEdit = z.infer<typeof blockEditSchema>;

export const reportEditSchema = blockEditSchema.extend({
  routine: timeblockRoutineSchema
    .nullable()
    .describe(
      "Full updated recurring class names and daily sleep settings, or null to leave them unchanged. Period times and period 4 lunch are fixed. These settings also apply to future reports.",
    ),
});

export function reportFingerprint(
  rows: TimeblockDraftRow[],
  routine: TimeblockRoutine,
) {
  return JSON.stringify([draftFingerprint(rows), routine]);
}

export function applyReportEdit(
  rows: TimeblockDraftRow[],
  routine: TimeblockRoutine,
  edit: z.infer<typeof reportEditSchema>,
  dueMonday: string,
) {
  const parsed = reportEditSchema.parse(edit);
  return {
    rows: applyBlockEdit(rows, parsed, dueMonday),
    routine: parsed.routine ?? routine,
  };
}

export function draftFingerprint(rows: TimeblockDraftRow[]) {
  return JSON.stringify(
    rows.map((r) => [
      r.id,
      r.title,
      r.startedAt,
      r.completedAt,
      r.status,
      r.included,
    ]),
  );
}

export function blockIssue(
  row: TimeblockDraftRow,
  dueMonday: string,
): string | null {
  if (!row.title.trim()) return "Give this block a name.";
  const start = parsePhoenixLocalDateTime(row.startedAt);
  const end = parsePhoenixLocalDateTime(row.completedAt);
  if (!start || !end || start >= end)
    return "Finish time must be after start time.";
  const week = timeblockWeek(dueMonday);
  if (end <= week.startAt || start >= week.endAtExclusive)
    return "This block must overlap the selected week.";
  if (end.getTime() - start.getTime() > 86_400_000)
    return "Keep each block within 24 hours.";
  return null;
}

// Atomic edits: validate the entire operation before changing the draft. Proof
// status is never model-controlled, and proof rows are excluded, never deleted.
export function applyBlockEdit(
  rows: TimeblockDraftRow[],
  edit: BlockEdit,
  dueMonday: string,
) {
  const parsed = blockEditSchema.parse(edit);
  const ids = new Set(rows.map((r) => r.id));
  const touched = [...parsed.upserts.map((r) => r.id), ...parsed.removeIds];
  if (new Set(touched).size !== touched.length)
    throw new Error("Edit each block only once per operation.");
  if (parsed.removeIds.some((id) => !ids.has(id)))
    throw new Error("A block to remove no longer exists.");
  const next = rows
    .filter((r) => !parsed.removeIds.includes(r.id) || r.status !== null)
    .map((r) =>
      parsed.removeIds.includes(r.id) ? { ...r, included: false } : { ...r },
    );
  for (const update of parsed.upserts) {
    const existing = rows.find((r) => r.id === update.id);
    if (!existing && !update.id.startsWith("manual-"))
      throw new Error("New blocks need a manual- ID.");
    const row = { ...update, status: existing?.status ?? null };
    const issue = blockIssue(row, dueMonday);
    if (issue) throw new Error(`${update.title}: ${issue}`);
    const index = next.findIndex((r) => r.id === update.id);
    if (index < 0) next.push(row);
    else next[index] = row;
  }
  if (next.length > 56) throw new Error("The report holds up to 56 blocks.");
  return next;
}

export function overlappingIds(rows: TimeblockDraftRow[]) {
  const included = rows.filter(
    (r) =>
      r.included &&
      parsePhoenixLocalDateTime(r.startedAt) &&
      parsePhoenixLocalDateTime(r.completedAt),
  );
  const ids = new Set<string>();
  for (let i = 0; i < included.length; i++) {
    for (let j = i + 1; j < included.length; j++) {
      if (
        included[i].startedAt < included[j].completedAt &&
        included[j].startedAt < included[i].completedAt
      ) {
        ids.add(included[i].id);
        ids.add(included[j].id);
      }
    }
  }
  return ids;
}
