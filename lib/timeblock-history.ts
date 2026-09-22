import { z } from "zod";
import {
  MAX_TIMEBLOCKS,
  type TimeblockDraftRow,
  timeblockDraftSchema,
} from "@/lib/timeblock-draft";
import {
  type TimeblockRoutine,
  timeblockRoutineSchema,
} from "@/lib/timeblock-routine";

const rowsSchema = timeblockDraftSchema.shape.rows.refine(
  (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
);
const entrySchema = z.object({
  rows: rowsSchema,
  // Only edits which changed the routine may restore it. The expected value
  // protects newer routine changes made from another week's history.
  routine: z
    .object({
      expected: timeblockRoutineSchema,
      restore: timeblockRoutineSchema,
    })
    .nullable(),
});
export const historySchema = z.object({
  past: z.array(entrySchema),
  future: z.array(entrySchema),
});
export type TimeblockHistory = z.infer<typeof historySchema>;

export function historyEntry(
  rows: TimeblockDraftRow[],
  before: TimeblockRoutine,
  after: TimeblockRoutine,
) {
  return {
    rows,
    routine:
      JSON.stringify(before) === JSON.stringify(after)
        ? null
        : { expected: after, restore: before },
  };
}

export function restoreHistoryEntry(
  history: TimeblockHistory,
  direction: "past" | "future",
  rows: TimeblockDraftRow[],
  routine: TimeblockRoutine,
  proofs: TimeblockDraftRow[],
) {
  const entry = history[direction].at(-1);
  if (!entry) return null;
  const routineConflict =
    entry.routine !== null &&
    JSON.stringify(entry.routine.expected) !== JSON.stringify(routine);
  const nextRoutine =
    entry.routine && !routineConflict ? entry.routine.restore : routine;
  const known = new Set(entry.rows.map((row) => row.id));
  const nextRows = [
    ...entry.rows.map((row) => {
      const proof = proofs.find((proof) => proof.id === row.id);
      return proof ? { ...row, status: proof.status } : row;
    }),
    ...proofs.filter((proof) => !known.has(proof.id)),
  ];
  if (nextRows.length > MAX_TIMEBLOCKS)
    throw new Error(
      "This edit cannot be restored because newly received proof would put the report over 280 blocks. Remove a manual block first.",
    );
  history[direction].pop();
  history[direction === "past" ? "future" : "past"].push(
    historyEntry(rows, routine, nextRoutine),
  );
  return { rows: nextRows, routine: nextRoutine, routineConflict };
}

export function parseTimeblockHistory(raw: string | null): TimeblockHistory {
  try {
    const parsed = historySchema.safeParse(JSON.parse(raw || "{}").history);
    if (parsed.success) return parsed.data;
  } catch {
    /* A legacy or damaged history must not prevent draft recovery. */
  }
  return { past: [], future: [] };
}
