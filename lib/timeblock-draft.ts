import { z } from "zod";

export const MAX_TIMEBLOCKS = 280;

const rowSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(160),
  startedAt: z.string().max(30),
  completedAt: z.string().max(30),
  status: z
    .enum(["OPEN", "AWAITING_REVIEW", "VERIFIED", "MISSED", "RENEGOTIATED"])
    .nullable(),
  included: z.boolean(),
});
export const timeblockDraftSchema = z.object({
  version: z.literal(1),
  rows: z.array(rowSchema).max(MAX_TIMEBLOCKS),
});
export type TimeblockDraftRow = z.infer<typeof rowSchema>;

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
