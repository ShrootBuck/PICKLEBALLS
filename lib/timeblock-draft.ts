import { z } from "zod";

export const MAX_TIMEBLOCKS = 280;
export const timeblockCategorySchema = z.string().trim().max(80).optional();

const rowSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(160),
  category: timeblockCategorySchema,
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
  order = "time",
) {
  return (
    (order === "category"
      ? (a.category || "Uncategorized").localeCompare(
          b.category || "Uncategorized",
        )
      : 0) ||
    a.startedAt.localeCompare(b.startedAt) ||
    a.id.localeCompare(b.id)
  );
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
