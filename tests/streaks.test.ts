import { describe, expect, test } from "bun:test";
import {
  createStreakSchema,
  crossedMilestones,
  formatElapsed,
  formatStreakMoney,
  formatStreakUnits,
  highestMilestone,
  hundredthsToInput,
  isSingleEmoji,
  isStreakMilestone,
  milestoneProgress,
  nextMilestone,
  parseMoneyInput,
  parseUnitsInput,
  type StreakEntrySource,
  slipWindow,
  streakActions,
  streakEntrySchema,
  streakHistory,
  streakTier,
  summarizeStreak,
  toCardSummary,
} from "@/lib/streak-policy";
import { phoenixDateKey } from "@/lib/time";

// Phoenix is UTC-7 all year. Monday, September 28, 2026 at 10:00 Phoenix.
const startedAt = new Date("2026-09-28T17:00:00Z");
const at = (day: string, hour = 9) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + (hour + 7) * 3_600_000);
const quit = { kind: "QUIT" as const, startedAt, retiredAt: null };
const build = { kind: "BUILD" as const, startedAt, retiredAt: null };
const clean = (day: string, costCents = 500, units = 300) =>
  ({
    day,
    kind: "CLEAN",
    occurredAt: at(day, 32),
    costCents,
    units,
  }) satisfies StreakEntrySource;
const slip = (when: Date) =>
  ({
    day: phoenixDateKey(when),
    kind: "SLIP",
    occurredAt: when,
    costCents: null,
    units: null,
  }) satisfies StreakEntrySource;
const log = (day: string, units: number | null = 1000) =>
  ({
    day,
    kind: "LOG",
    occurredAt: at(day, 20),
    costCents: null,
    units,
  }) satisfies StreakEntrySource;

describe("quit streaks", () => {
  test("a day can only be confirmed after it ends", () => {
    const sameDay = summarizeStreak(quit, [], at("2026-09-28", 21));
    expect(sameDay.current).toBe(0);
    expect(sameDay.todayState).toBe("pending");
    expect(sameDay.yesterdayState).toBeNull();
    expect(streakActions({ ...quit, status: "ACTIVE" }, sameDay)).toEqual({
      confirmDay: null,
      logDays: [],
      canSlip: true,
      needsLog: false,
      breaksTonight: false,
    });

    const nextMorning = summarizeStreak(quit, [], at("2026-09-29"));
    expect(nextMorning.yesterdayState).toBe("pending");
    const actions = streakActions({ ...quit, status: "ACTIVE" }, nextMorning);
    expect(actions.confirmDay).toBe("2026-09-28");
    expect(actions.needsLog).toBe(true);
    expect(actions.breaksTonight).toBe(true);

    const confirmed = summarizeStreak(
      quit,
      [clean("2026-09-28")],
      at("2026-09-29"),
    );
    expect(confirmed.current).toBe(1);
    expect(confirmed.settled).toBe(1);
    expect(confirmed.run).toEqual({ costCents: 500, units: 300 });
  });

  test("an unconfirmed day breaks the streak once its grace day ends", () => {
    const summary = summarizeStreak(
      quit,
      [clean("2026-09-28"), clean("2026-09-29")],
      at("2026-10-02"),
    );
    expect(summary.days.map((day) => day.state)).toEqual([
      "done",
      "done",
      "missed",
      "pending",
      "pending",
    ]);
    expect(summary.current).toBe(0);
    expect(summary.longest).toBe(2);
    expect(summary.runStartDay).toBe("2026-10-01");
    expect(summary.runStartedAt).toBe("2026-10-01T07:00:00.000Z");
    expect(summary.allTime.costCents).toBe(1000);
    expect(summary.run.costCents).toBe(0);
  });

  test("several slips in a day reset once and restart the clock at the latest", () => {
    const first = at("2026-10-01", 9);
    const latest = at("2026-10-01", 15);
    const summary = summarizeStreak(
      quit,
      [
        clean("2026-09-28"),
        clean("2026-09-29"),
        clean("2026-09-30"),
        slip(first),
        slip(latest),
      ],
      at("2026-10-01", 18),
    );
    expect(summary.todayState).toBe("slipped");
    expect(summary.current).toBe(0);
    expect(summary.longest).toBe(3);
    expect(summary.slips).toBe(2);
    expect(summary.slipsThisMonth).toBe(2);
    expect(summary.runStartedAt).toBe(latest.toISOString());
    expect(summary.lastSlipAt).toBe(latest.toISOString());
    expect(summary.runStartDay).toBe("2026-10-02");
  });

  test("a slip outranks a clean confirmation for the same day", () => {
    const summary = summarizeStreak(
      quit,
      [clean("2026-09-28"), slip(at("2026-09-28", 22))],
      at("2026-09-29"),
    );
    expect(summary.yesterdayState).toBe("slipped");
    expect(summary.current).toBe(0);
    expect(summary.allTime.costCents).toBe(0);
  });
});

describe("build streaks", () => {
  test("several logs in a day add up", () => {
    const summary = summarizeStreak(
      build,
      [log("2026-09-28", 1000), log("2026-09-28", 1500)],
      at("2026-09-28", 22),
    );
    expect(summary.todayState).toBe("done");
    expect(summary.current).toBe(1);
    expect(summary.run.units).toBe(2500);
    expect(summary.days[0].units).toBe(2500);
  });

  test("an unlogged grace day bridges the count but not milestones", () => {
    const entries = [
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ].map((day) => log(day));
    const now = at("2026-10-05", 20);
    const bridged = summarizeStreak(
      build,
      [...entries, log("2026-10-05")],
      now,
    );
    expect(bridged.yesterdayState).toBe("pending");
    expect(bridged.current).toBe(7);
    expect(bridged.settled).toBe(1);
    const filled = summarizeStreak(
      build,
      [...entries, log("2026-10-05"), log("2026-10-04")],
      now,
    );
    expect(filled.current).toBe(8);
    expect(filled.settled).toBe(8);
    expect(crossedMilestones(bridged.settled, filled.settled)).toEqual([7]);

    const broken = summarizeStreak(
      build,
      [...entries, log("2026-10-05")],
      at("2026-10-06", 8),
    );
    expect(broken.current).toBe(1);
    expect(broken.runStartDay).toBe("2026-10-05");
  });

  test("today and yesterday are both open for logs", () => {
    const summary = summarizeStreak(build, [], at("2026-09-29", 12));
    expect(
      streakActions({ ...build, status: "ACTIVE" }, summary).logDays,
    ).toEqual(["2026-09-29", "2026-09-28"]);
  });
});

test("retired streaks stay frozen as they were", () => {
  const retired = summarizeStreak(
    { ...quit, retiredAt: at("2026-09-30", 12) },
    [clean("2026-09-28"), clean("2026-09-29")],
    at("2026-12-01"),
  );
  expect(retired.today).toBe("2026-09-30");
  expect(retired.current).toBe(2);
  expect(retired.days.at(-1)?.state).toBe("pending");
  expect(streakActions({ ...quit, status: "RETIRED" }, retired).needsLog).toBe(
    false,
  );
});

test("milestones, tiers, and progress", () => {
  expect(crossedMilestones(6, 7)).toEqual([7]);
  expect(crossedMilestones(7, 7)).toEqual([]);
  expect(crossedMilestones(29, 31)).toEqual([30]);
  expect(crossedMilestones(364, 731)).toEqual([365, 730]);
  expect(isStreakMilestone(730)).toBe(true);
  expect(isStreakMilestone(400)).toBe(false);
  expect(nextMilestone(0)).toBe(7);
  expect(nextMilestone(365)).toBe(730);
  expect(highestMilestone(6)).toBeNull();
  expect(highestMilestone(45)).toBe(30);
  expect(highestMilestone(800)).toBe(730);
  expect(milestoneProgress(12)).toEqual({
    previous: 7,
    next: 30,
    remaining: 18,
    fraction: 5 / 23,
  });
  expect([0, 6, 7, 29, 30, 99, 100].map(streakTier)).toEqual([
    "spark",
    "spark",
    "flame",
    "flame",
    "blaze",
    "blaze",
    "inferno",
  ]);
});

test("history groups entries by day and only undoes open days", () => {
  const entries = [
    { ...log("2026-09-28"), id: "a", note: "Morning" },
    { ...log("2026-09-30"), id: "b", note: null },
  ];
  const summary = summarizeStreak(build, entries, at("2026-10-01", 12));
  const history = streakHistory(summary, entries, { canUndo: true });
  expect(history.map((day) => [day.day, day.state])).toEqual([
    ["2026-09-30", "done"],
    ["2026-09-29", "missed"],
    ["2026-09-28", "done"],
  ]);
  expect(history[0].entries[0].canUndo).toBe(true);
  expect(history[2].entries[0].canUndo).toBe(false);
  const card = toCardSummary(summary);
  expect(card.week.map((day) => day.state)).toEqual([
    null,
    null,
    null,
    "done",
    "missed",
    "done",
    "pending",
  ]);
});

test("slips can be logged from the start of yesterday", () => {
  const now = at("2026-10-01", 12);
  expect(slipWindow(startedAt, now).min.toISOString()).toBe(
    "2026-09-30T07:00:00.000Z",
  );
  expect(slipWindow(at("2026-10-01", 6), now).min.toISOString()).toBe(
    at("2026-10-01", 6).toISOString(),
  );
});

test("amount inputs and formatting", () => {
  expect(parseMoneyInput("$5.5")).toBe(550);
  expect(parseMoneyInput("5")).toBe(500);
  expect(parseMoneyInput("1,250")).toBe(125000);
  expect(parseMoneyInput("")).toBeNull();
  expect(parseMoneyInput("0")).toBeUndefined();
  expect(parseMoneyInput("abc")).toBeUndefined();
  expect(parseUnitsInput("1.5")).toBe(150);
  expect(parseUnitsInput("$3")).toBeUndefined();
  expect(hundredthsToInput(150)).toBe("1.5");
  expect(hundredthsToInput(1000)).toBe("10");
  expect(hundredthsToInput(null)).toBe("");
  expect(formatStreakMoney(6000)).toBe("$60");
  expect(formatStreakMoney(650)).toBe("$6.50");
  expect(formatStreakUnits(3600, "cups")).toBe("36 cups");
  expect(formatStreakUnits(250, "miles")).toBe("2.5 miles");
  expect(formatElapsed(0)).toBe("less than a minute");
  expect(formatElapsed(61 * 60_000)).toBe("1 hour, 1 minute");
  expect(formatElapsed((2 * 1440 + 5 * 60) * 60_000)).toBe("2 days, 5 hours");
});

test("emoji and streak validation", () => {
  expect(isSingleEmoji("☕")).toBe(true);
  expect(isSingleEmoji("👨‍👩‍👧")).toBe(true);
  expect(isSingleEmoji("🇺🇸")).toBe(true);
  expect(isSingleEmoji("☕☕")).toBe(false);
  expect(isSingleEmoji("a")).toBe(false);
  const base = {
    circleId: "circle",
    title: "No caffeine",
    emoji: "☕",
    kind: "QUIT",
    visibility: "CIRCLE",
  };
  expect(
    createStreakSchema.safeParse({
      ...base,
      dailyCostCents: 500,
      dailyUnits: 300,
      unitLabel: "cups",
    }).success,
  ).toBe(true);
  expect(
    createStreakSchema.safeParse({
      ...base,
      kind: "BUILD",
      dailyCostCents: 500,
    }).success,
  ).toBe(false);
  expect(
    createStreakSchema.safeParse({ ...base, dailyUnits: 300 }).success,
  ).toBe(false);
  expect(
    createStreakSchema.safeParse({ ...base, visibility: "SECRET" }).success,
  ).toBe(false);
  expect(
    streakEntrySchema.safeParse({ action: "log", day: "2026-02-30" }).success,
  ).toBe(false);
  expect(
    streakEntrySchema.safeParse({
      action: "slip",
      occurredAt: "2026-10-01T15:30",
      note: "Long day",
    }).success,
  ).toBe(true);
});
