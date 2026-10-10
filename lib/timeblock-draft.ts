import { z } from "zod";

export const MAX_TIMEBLOCKS = 280;

const rowSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(160),
  startedAt: z.string().max(30),
  completedAt: z.string().max(30),
  // Drafts live on devices, so map the status saved while approvals were off.
  status: z.preprocess(
    (status) => (status === "DONE" ? "VERIFIED" : status),
    z
      .enum([
        "OPEN",
        "AWAITING_REVIEW",
        "VERIFIED",
        "MISSED",
        "RENEGOTIATED",
        "CANCELLED",
      ])
      .nullable(),
  ),
  included: z.boolean(),
  sessionId: z.string().optional(),
  sourceUpdatedAt: z.string().optional(),
});
export const timeblockDraftSchema = z.object({
  version: z.literal(1),
  rows: z.array(rowSchema).max(MAX_TIMEBLOCKS),
});
export type TimeblockDraftRow = z.infer<typeof rowSchema>;

// Reconcile saved drafts and undo history with new recordings. Report-only
// edits survive refresh; a corrected source session replaces its old times.
export function reconcileTimeblockRows(
  current: TimeblockDraftRow[],
  fresh: TimeblockDraftRow[],
  replacedProofIds: string[] = [],
) {
  const replaced = new Set(replacedProofIds);
  const byId = new Map(fresh.map((row) => [row.id, row]));
  const next = current
    .filter(
      (row) => !replaced.has(row.id) && (!row.sessionId || byId.has(row.id)),
    )
    .map((row) => {
      const source = byId.get(row.id);
      if (!source) return row;
      if (row.sessionId && source.sourceUpdatedAt !== row.sourceUpdatedAt)
        return { ...source, included: row.included };
      return { ...row, status: source.status };
    });
  const known = new Set(next.map((row) => row.id));
  return [...next, ...fresh.filter((row) => !known.has(row.id))];
}

export function compareTimeblockRows(
  a: TimeblockDraftRow,
  b: TimeblockDraftRow,
) {
  return a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id);
}

export function parseTimeblockDraft(
  raw: string | null,
): TimeblockDraftRow[] | null {
  if (!raw) return null;
  try {
    const parsed = timeblockDraftSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      new Set(parsed.data.rows.map((row) => row.id)).size !==
        parsed.data.rows.length
    )
      return null;
    return parsed.data.rows;
  } catch {
    return null;
  }
}
