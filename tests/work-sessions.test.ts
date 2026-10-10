import { expect, test } from "bun:test";
import {
  parsePhoenixLocalDateTime,
  phoenixLocalDateTimeValue,
} from "@/lib/time";
import { reconcileTimeblockRows } from "@/lib/timeblock-draft";
import { blockIssue } from "@/lib/timeblock-editor";
import { historyEntry, restoreHistoryEntry } from "@/lib/timeblock-history";
import { EMPTY_ROUTINE } from "@/lib/timeblock-routine";
import {
  canTrackTask,
  elapsedMilliseconds,
  formatStopwatch,
  summarizeWorkSessions,
  type WorkSessionView,
} from "@/lib/work-session-policy";
import { workSessionTimeblocks } from "@/lib/work-session-timeblocks";

const base: WorkSessionView = {
  id: "first",
  taskId: "physics",
  circleId: "circle",
  title: "Physics",
  startedAt: "2026-10-09T23:00:00.000Z",
  endedAt: "2026-10-09T23:25:00.000Z",
  updatedAt: "2026-10-09T23:25:00.000Z",
};
function source(session: WorkSessionView) {
  return {
    ...session,
    startedAt: new Date(session.startedAt),
    endedAt: session.endedAt ? new Date(session.endedAt) : null,
    updatedAt: new Date(session.updatedAt),
    commitment: { title: session.title, status: "OPEN" as const },
  };
}
test("elapsed time comes from timestamps and excludes breaks between sessions", () => {
  const second = {
    ...base,
    id: "second",
    startedAt: "2026-10-09T23:40:00.000Z",
    endedAt: "2026-10-10T00:10:00.000Z",
  };
  const running = { ...base, endedAt: null };
  expect(elapsedMilliseconds(running, Date.parse("2026-10-10T00:00:00Z"))).toBe(
    3600000,
  );
  expect(elapsedMilliseconds(running, Date.parse("2026-10-09T00:00:00Z"))).toBe(
    0,
  );
  expect(summarizeWorkSessions([base, second, running])).toMatchObject({
    count: 2,
    milliseconds: 55 * 60_000,
    startedAt: base.startedAt,
    endedAt: second.endedAt,
  });
  expect(formatStopwatch(55 * 60_000)).toBe("00:55:00");
  expect(formatStopwatch(100 * 3600_000 + 1000)).toBe("100:00:01");
});
test("stopwatch eligibility preserves task deadlines, cancellation and proof rules", () => {
  const task = {
    status: "OPEN" as const,
    dueAt: "2026-10-10T01:00:00Z",
    proof: null,
    proofSubmittedAt: null,
  };
  const now = Date.parse("2026-10-10T00:00:00Z");
  expect(canTrackTask(task, now)).toBe(true);
  expect(canTrackTask(task, now + 3600_000)).toBe(false);
  expect(canTrackTask({ ...task, proofSubmittedAt: base.startedAt }, now)).toBe(
    false,
  );
  expect(
    canTrackTask(
      { ...task, proof: { id: "proof", reviewStatus: "PENDING" } },
      now,
    ),
  ).toBe(false);
  expect(
    canTrackTask(
      {
        ...task,
        proofSubmittedAt: base.startedAt,
        proof: { id: "proof", reviewStatus: "CHALLENGED" },
      },
      now + 86400_000,
    ),
  ).toBe(true);
  for (const status of ["VERIFIED", "MISSED", "CANCELLED"] as const)
    expect(canTrackTask({ ...task, status }, now)).toBe(false);
});
test("sub-minute recordings survive Phoenix conversion and report validation", () => {
  const short = { ...base, endedAt: "2026-10-09T23:00:00.125Z" };
  const rows = workSessionTimeblocks([source(short)], "2026-10-12");
  expect(rows).toHaveLength(1);
  expect(blockIssue(rows[0], "2026-10-12")).toBeNull();
  const time = new Date("2026-10-10T07:00:00.125Z");
  expect(
    parsePhoenixLocalDateTime(phoenixLocalDateTimeValue(time, true))?.getTime(),
  ).toBe(time.getTime());
  for (const invalid of [
    "2026-02-30T16:00",
    "2026-10-09T24:00",
    "2026-10-09T16:00:60",
    "2026-10-09T16:00:00.1234",
  ])
    expect(parsePhoenixLocalDateTime(invalid)).toBeNull();
});
test("overnight sessions split at Phoenix midnight and clip to each report week", () => {
  const overnight = {
    ...base,
    startedAt: "2026-10-12T06:45:00.000Z",
    endedAt: "2026-10-12T07:15:00.000Z",
  };
  const previous = workSessionTimeblocks([source(overnight)], "2026-10-12");
  const next = workSessionTimeblocks([source(overnight)], "2026-10-19");
  expect(previous.map((row) => [row.startedAt, row.completedAt])).toEqual([
    ["2026-10-11T23:45:00.000", "2026-10-12T00:00:00.000"],
  ]);
  expect(next.map((row) => [row.startedAt, row.completedAt])).toEqual([
    ["2026-10-12T00:00:00.000", "2026-10-12T00:15:00.000"],
  ]);
  const long = { ...base, endedAt: "2026-10-12T07:00:00.000Z" };
  const rows = workSessionTimeblocks([source(long)], "2026-10-12");
  expect(rows).toHaveLength(3);
  expect(rows.every((row) => blockIssue(row, "2026-10-12") === null)).toBe(
    true,
  );
  expect(
    workSessionTimeblocks([source({ ...base, endedAt: null })], "2026-10-12"),
  ).toEqual([]);
});
test("drafts and undo replace duplicate proof rows and reconcile corrected or moved sessions", () => {
  const [recorded] = workSessionTimeblocks([source(base)], "2026-10-12");
  const proof = {
    ...recorded,
    id: base.taskId,
    sessionId: undefined,
    sourceUpdatedAt: undefined,
  };
  const manual = { ...proof, id: "manual-1", status: null };
  const changed = {
    ...recorded,
    startedAt: "2026-10-09T15:50:00.000",
    sourceUpdatedAt: "2026-10-10T01:00:00Z",
  };
  const current = [{ ...recorded, included: false }, proof, manual];
  expect(reconcileTimeblockRows(current, [changed], [base.taskId])).toEqual([
    { ...changed, included: false },
    manual,
  ]);
  expect(reconcileTimeblockRows(current, [], [base.taskId])).toEqual([manual]);
  const edited = { ...recorded, title: "Report-only wording" };
  expect(reconcileTimeblockRows([edited], [recorded])).toEqual([edited]);
  const history = {
    past: [historyEntry([proof, manual], EMPTY_ROUTINE, EMPTY_ROUTINE)],
    future: [],
  };
  expect(
    restoreHistoryEntry(
      history,
      "past",
      [recorded, manual],
      EMPTY_ROUTINE,
      [recorded],
      [base.taskId],
    )?.rows,
  ).toEqual([manual, recorded]);
});
