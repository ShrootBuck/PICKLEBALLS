import { describe, expect, test } from "bun:test";
import {
  canEditTask,
  dailyTaskLimit,
  isLateProof,
  shouldMarkMissed,
  validateTaskTiming,
} from "@/lib/task-policy";
import {
  cadencePeriod,
  isValidCadencePeriod,
  phoenixDateKey,
} from "@/lib/time";

describe("Phoenix task policy", () => {
  test("uses the fixed Phoenix boundary", () => {
    expect(phoenixDateKey(new Date("2026-09-02T06:59:59.999Z"))).toBe(
      "2026-09-01",
    );
    expect(phoenixDateKey(new Date("2026-09-02T07:00:00.000Z"))).toBe(
      "2026-09-02",
    );
  });

  test("permits today through seven days and no farther", () => {
    const now = new Date("2026-09-01T18:00:00.000Z");
    expect(validateTaskTiming("2026-09-01", "23:59", now).ok).toBe(true);
    expect(validateTaskTiming("2026-09-08", "23:59", now).ok).toBe(true);
    expect(validateTaskTiming("2026-09-09", "23:59", now).ok).toBe(false);
    expect(dailyTaskLimit).toBe(3);
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

describe("Screen Time periods", () => {
  test("normalizes a week to Monday through Sunday", () => {
    expect(cadencePeriod("WEEKLY", "2026-09-02")).toEqual({
      start: "2026-08-31",
      end: "2026-09-06",
    });
  });

  test("accepts one-day daily and seven-day weekly receipts", () => {
    expect(isValidCadencePeriod("DAILY", "2026-09-01", "2026-09-01")).toBe(
      true,
    );
    expect(isValidCadencePeriod("DAILY", "2026-09-01", "2026-09-02")).toBe(
      false,
    );
    expect(isValidCadencePeriod("WEEKLY", "2026-08-31", "2026-09-06")).toBe(
      true,
    );
    expect(isValidCadencePeriod("WEEKLY", "2026-08-31", "2026-09-05")).toBe(
      false,
    );
  });
});
