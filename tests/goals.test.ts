import { describe, expect, test } from "bun:test";
import {
  createGoalSchema,
  goalActionSchema,
  milestoneProgress,
} from "@/lib/goal-policy";

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
