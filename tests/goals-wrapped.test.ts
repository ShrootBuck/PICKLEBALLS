import { describe, expect, test } from "bun:test";
import {
  createGoalSchema,
  goalActionSchema,
  milestoneProgress,
} from "@/lib/goal-policy";
import {
  firstWrappedWeek,
  screenTimeImprovement,
  wrappedWeek,
} from "@/lib/wrapped-policy";

describe("goals", () => {
  test("validates actual calendar dates and milestone limits", () => {
    expect(
      createGoalSchema.safeParse({
        circleId: "circle",
        title: "Goal",
        targetDate: "2027-02-29",
      }).success,
    ).toBe(false);
    expect(
      createGoalSchema.safeParse({
        circleId: "circle",
        title: "Goal",
        targetDate: "2028-02-29",
      }).success,
    ).toBe(true);
    expect(
      createGoalSchema.safeParse({
        circleId: "circle",
        title: "Goal",
        milestones: Array(21).fill("Step"),
      }).success,
    ).toBe(false);
    expect(
      createGoalSchema.safeParse({
        circleId: "circle",
        title: " ",
        milestones: [],
      }).success,
    ).toBe(false);
    expect(
      goalActionSchema.safeParse({
        action: "milestone",
        milestoneId: "x",
        completed: "yes",
      }).success,
    ).toBe(false);
  });
  test("progress is explicit milestones, including an empty goal", () => {
    expect(milestoneProgress([])).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
    });
    expect(
      milestoneProgress([
        { completedAt: new Date() },
        { completedAt: null },
        { completedAt: null },
      ]),
    ).toEqual({ completed: 1, total: 3, percent: 33 });
  });
});

describe("wrapped weeks", () => {
  test("rolls over on Sunday at midnight in Phoenix, not UTC", () => {
    expect(
      wrappedWeek(undefined, new Date("2026-10-04T06:59:59Z")).startKey,
    ).toBe("2026-09-20");
    const week = wrappedWeek(undefined, new Date("2026-10-04T07:00:00Z"));
    expect(week.startKey).toBe("2026-09-27");
    expect(week.startAt.toISOString()).toBe("2026-09-27T07:00:00.000Z");
    expect(week.endAt.toISOString()).toBe("2026-10-04T07:00:00.000Z");
  });
  test("rejects invalid, future, current, and non-Sunday weeks", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    for (const value of [
      "garbage",
      "2026-02-30",
      "2026-09-21",
      "2026-09-27",
      "2027-01-03",
      "0000-01-02",
    ])
      expect(() => wrappedWeek(value, now)).toThrow();
    expect(firstWrappedWeek(new Date("2026-09-27T06:00:00Z"))).toBe(
      "2026-09-20",
    );
  });
  test("missing baselines and increases never become invented improvements", () => {
    expect(screenTimeImprovement(100, null)).toBeNull();
    expect(screenTimeImprovement(null, 150)).toBeNull();
    expect(screenTimeImprovement(0, 0)).toBeNull();
    expect(screenTimeImprovement(150, 100)).toBeNull();
    expect(screenTimeImprovement(90, 120)).toEqual({
      minutes: 30,
      percent: 25,
    });
    expect(screenTimeImprovement(0, 120)).toEqual({
      minutes: 120,
      percent: 100,
    });
  });
});
