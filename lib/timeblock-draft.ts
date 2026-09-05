import { z } from "zod";

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
  rows: z.array(rowSchema).max(56),
});
export type TimeblockDraftRow = z.infer<typeof rowSchema>;

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
