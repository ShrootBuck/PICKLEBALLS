import { expect, test } from "bun:test";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import {
  historyEntry,
  parseTimeblockHistory,
  restoreHistoryEntry,
  type TimeblockHistory,
} from "@/lib/timeblock-history";
import { EMPTY_ROUTINE } from "@/lib/timeblock-routine";

function restore(...args: Parameters<typeof restoreHistoryEntry>) {
  const result = restoreHistoryEntry(...args);
  if (!result) throw new Error("Expected a history entry");
  return result;
}

const row: TimeblockDraftRow = {
  id: "manual-1",
  title: "Physics",
  startedAt: "2026-09-15T16:00",
  completedAt: "2026-09-15T17:00",
  included: true,
  status: null,
};
const routine = {
  ...EMPTY_ROUTINE,
  sleep: { bedtime: "22:00", wakeTime: "06:00" },
};
const newerRoutine = {
  ...routine,
  sleep: { bedtime: "23:00", wakeTime: "07:00" },
};
const roundTrip = (history: TimeblockHistory) =>
  parseTimeblockHistory(JSON.stringify({ version: 1, rows: [row], history }));

test("more than 40 individual edits survive reload and can all be undone and redone", () => {
  let history: TimeblockHistory = { past: [], future: [] };
  let rows = [row];
  for (let i = 0; i < 100; i++) {
    history.past.push(historyEntry(rows, EMPTY_ROUTINE, EMPTY_ROUTINE));
    rows = [{ ...row, title: `Edit ${i}` }];
  }
  history = roundTrip(history);
  expect(history.past).toHaveLength(100);
  for (let i = 0; i < 100; i++)
    rows = restore(history, "past", rows, EMPTY_ROUTINE, []).rows;
  expect(rows).toEqual([row]);
  history = roundTrip(history);
  for (let i = 0; i < 100; i++)
    rows = restore(history, "future", rows, EMPTY_ROUTINE, []).rows;
  expect(rows[0].title).toBe("Edit 99");
});

test("block-only undo never restores an unrelated routine", () => {
  const history = roundTrip({
    past: [historyEntry([], EMPTY_ROUTINE, EMPTY_ROUTINE)],
    future: [],
  });
  expect(restore(history, "past", [row], routine, []).routine).toEqual(routine);
});

test("routine edits undo and redo together with their blocks", () => {
  const history = roundTrip({
    past: [historyEntry([], EMPTY_ROUTINE, routine)],
    future: [],
  });
  const undone = restore(history, "past", [row], routine, []);
  expect(undone.routine).toEqual(EMPTY_ROUTINE);
  expect(undone.rows).toEqual([]);
  const redone = restore(
    roundTrip(history),
    "future",
    undone.rows,
    undone.routine,
    [],
  );
  expect(redone.routine).toEqual(routine);
  expect(redone.rows).toEqual([row]);
});

test("newer recurring settings survive old undo and redo", () => {
  const history = roundTrip({
    past: [historyEntry([], EMPTY_ROUTINE, routine)],
    future: [],
  });
  const undone = restore(history, "past", [row], newerRoutine, []);
  expect(undone.routineConflict).toBe(true);
  expect(undone.routine).toEqual(newerRoutine);
  expect(
    restore(history, "future", undone.rows, undone.routine, []).routine,
  ).toEqual(newerRoutine);
});

test("undo preserves fresh proof status and newly received proof", () => {
  const oldProof = {
    ...row,
    id: "proof-1",
    status: "AWAITING_REVIEW" as const,
  };
  const freshProof = { ...oldProof, status: "VERIFIED" as const };
  const newProof = { ...freshProof, id: "proof-2" };
  const history = {
    past: [historyEntry([oldProof], EMPTY_ROUTINE, EMPTY_ROUTINE)],
    future: [],
  };
  expect(
    restore(history, "past", [freshProof, newProof], EMPTY_ROUTINE, [
      freshProof,
      newProof,
    ]).rows,
  ).toEqual([freshProof, newProof]);
});

test("legacy and damaged histories recover as empty", () => {
  for (const raw of [
    null,
    "broken",
    JSON.stringify({ version: 1, rows: [row] }),
    JSON.stringify({
      history: { past: [{ rows: [row, row], routine: null }], future: [] },
    }),
  ]) {
    expect(parseTimeblockHistory(raw)).toEqual({ past: [], future: [] });
  }
});

test("new proofs cannot make undo exceed the report limit or consume history", () => {
  const full = Array.from({ length: 280 }, (_, i) => ({
    ...row,
    id: `manual-${i}`,
  }));
  const history = {
    past: [historyEntry(full, EMPTY_ROUTINE, EMPTY_ROUTINE)],
    future: [],
  };
  expect(() =>
    restoreHistoryEntry(history, "past", [], EMPTY_ROUTINE, [
      { ...row, id: "proof-new", status: "VERIFIED" },
    ]),
  ).toThrow("over 280 blocks");
  expect(history.past).toHaveLength(1);
  expect(history.future).toHaveLength(0);
});
