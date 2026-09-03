import { describe, expect, test } from "bun:test";
import {
  canEditTask,
  isLateProof,
  requiredApprovalsForCircle,
  shouldMarkMissed,
} from "@/lib/task-policy";
import { phoenixDateKey } from "@/lib/time";

describe("Phoenix task policy", () => {
  test("uses the fixed Phoenix boundary", () => {
    expect(phoenixDateKey(new Date("2026-09-02T06:59:59.999Z"))).toBe(
      "2026-09-01",
    );
    expect(phoenixDateKey(new Date("2026-09-02T07:00:00.000Z"))).toBe(
      "2026-09-02",
    );
  });

  test("one approval verifies when peers exist", () => {
    expect(requiredApprovalsForCircle(1)).toBe(0);
    expect(requiredApprovalsForCircle(2)).toBe(1);
    expect(requiredApprovalsForCircle(3)).toBe(1);
    expect(requiredApprovalsForCircle(4)).toBe(1);
    expect(requiredApprovalsForCircle(6)).toBe(1);
    expect(requiredApprovalsForCircle(8)).toBe(1);
  });

  test("locks edits at the due instant and permanently marks later proof", () => {
    const due = new Date("2026-09-02T02:00:00.000Z");
    expect(canEditTask(due, new Date("2026-09-02T01:59:59.999Z"))).toBe(true);
    expect(canEditTask(due, due)).toBe(false);
    expect(isLateProof(due, due)).toBe(false);
    expect(isLateProof(due, new Date(due.getTime() + 1))).toBe(true);
  });

  test("marks only unproved open or renegotiated work missed", () => {
    const due = new Date("2026-09-01T16:00:00.000Z");
    const now = new Date("2026-09-01T17:00:00.000Z");
    expect(shouldMarkMissed("OPEN", due, 0, now)).toBe(true);
    expect(shouldMarkMissed("RENEGOTIATED", due, 0, now)).toBe(true);
    expect(shouldMarkMissed("VERIFIED", due, 0, now)).toBe(false);
    expect(shouldMarkMissed("OPEN", due, 1, now)).toBe(false);
  });
});
