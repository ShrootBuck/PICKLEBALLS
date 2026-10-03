import { z } from "zod";
import type { SocialAuthor } from "@/lib/social-types";
import { parseDateKey, phoenixDateKey, phoenixWallToDate } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

export type StreakKind = "QUIT" | "BUILD";
export type StreakVisibility = "CIRCLE" | "PRIVATE";
export type StreakStatus = "ACTIVE" | "RETIRED";
export type StreakEntryKind = "CLEAN" | "SLIP" | "LOG";
export type StreakDayState = "done" | "slipped" | "missed" | "pending";
export type StreakTier = "spark" | "flame" | "blaze" | "inferno";

export const STREAK_MILESTONES = [7, 30, 60, 100, 180, 365] as const;
const YEAR = 365;
const MAX_AMOUNT = 1_000_000;

type DateLike = Date | string;

export type StreakSource = {
  kind: StreakKind;
  startedAt: DateLike;
  retiredAt: DateLike | null;
};

export type StreakEntrySource = {
  day: DateLike;
  kind: StreakEntryKind;
  occurredAt: DateLike;
  costCents: number | null;
  units: number | null;
};

export type StreakDay = {
  day: string;
  state: StreakDayState;
  units: number;
  costCents: number;
  slips: number;
};

export type StreakTotals = { costCents: number; units: number };

export type StreakSummary = {
  // When this summary was computed: now, or the retirement time.
  asOf: string;
  today: string;
  yesterday: string;
  startDay: string;
  // Successful days in the current run. Days still inside their logging
  // window never break it.
  current: number;
  longest: number;
  // The unbroken run of logged days ending at the latest one. Milestones use
  // this, so a run bridged by an unlogged day cannot celebrate early.
  settled: number;
  runStartDay: string;
  // When the current run began: the start, the latest slip, or the midnight
  // after a missed day. Quit streaks show a live clock from here.
  runStartedAt: string;
  runStartReason: "start" | "slip" | "missed";
  totalDays: number;
  slips: number;
  slipsThisMonth: number;
  lastSlipAt: string | null;
  run: StreakTotals;
  allTime: StreakTotals;
  todayState: StreakDayState;
  yesterdayState: StreakDayState | null;
  days: StreakDay[];
};

type DayTotals = {
  clean: boolean;
  cleanCost: number;
  cleanUnits: number;
  logs: number;
  logUnits: number;
  slips: number;
  lastSlip: number;
};

function dayKeyOf(value: DateLike) {
  return (typeof value === "string" ? value : value.toISOString()).slice(0, 10);
}

function phoenixMidnight(dayKey: string) {
  return (phoenixWallToDate(dayKey, 0, 0, 0, 0) as Date).getTime();
}

export function summarizeStreak(
  streak: StreakSource,
  entries: readonly StreakEntrySource[],
  now = new Date(),
): StreakSummary {
  const startedAt = new Date(streak.startedAt);
  // Retired streaks are frozen as they stood when they were retired.
  const asOf = streak.retiredAt ? new Date(streak.retiredAt) : now;
  const today = phoenixDateKey(asOf);
  const yesterday = shiftDateKey(today, -1);
  const startDay = phoenixDateKey(startedAt);
  const month = today.slice(0, 7);
  const byDay = new Map<string, DayTotals>();
  let slips = 0;
  let slipsThisMonth = 0;
  let lastSlip = 0;
  for (const entry of entries) {
    const key = dayKeyOf(entry.day);
    const totals = byDay.get(key) ?? {
      clean: false,
      cleanCost: 0,
      cleanUnits: 0,
      logs: 0,
      logUnits: 0,
      slips: 0,
      lastSlip: 0,
    };
    if (entry.kind === "CLEAN") {
      totals.clean = true;
      totals.cleanCost += entry.costCents ?? 0;
      totals.cleanUnits += entry.units ?? 0;
    } else if (entry.kind === "LOG") {
      totals.logs += 1;
      totals.logUnits += entry.units ?? 0;
    } else {
      const at = new Date(entry.occurredAt).getTime();
      totals.slips += 1;
      totals.lastSlip = Math.max(totals.lastSlip, at);
      slips += 1;
      if (key.slice(0, 7) === month) slipsThisMonth += 1;
      lastSlip = Math.max(lastSlip, at);
    }
    byDay.set(key, totals);
  }

  const days: StreakDay[] = [];
  const run = { costCents: 0, units: 0 };
  const allTime = { costCents: 0, units: 0 };
  let current = 0;
  let longest = 0;
  let settled = 0;
  let segment = 0;
  let totalDays = 0;
  let runStartDay = startDay;
  let runStartedAt = startedAt.getTime();
  let runStartReason: StreakSummary["runStartReason"] = "start";
  for (let day = startDay; day <= today; day = shiftDateKey(day, 1)) {
    const totals = byDay.get(day);
    const open = day >= yesterday;
    let state: StreakDayState;
    let units = 0;
    let costCents = 0;
    if (streak.kind === "QUIT") {
      if (totals?.slips) state = "slipped";
      else if (totals?.clean) {
        state = "done";
        units = totals.cleanUnits;
        costCents = totals.cleanCost;
      } else state = open ? "pending" : "missed";
    } else if (totals?.logs) {
      state = "done";
      units = totals.logUnits;
    } else state = open ? "pending" : "missed";
    days.push({ day, state, units, costCents, slips: totals?.slips ?? 0 });

    if (state === "done") {
      current += 1;
      segment += 1;
      settled = segment;
      totalDays += 1;
      longest = Math.max(longest, current);
      run.costCents += costCents;
      run.units += units;
      allTime.costCents += costCents;
      allTime.units += units;
    } else if (state === "pending") {
      segment = 0;
    } else {
      current = 0;
      segment = 0;
      settled = 0;
      run.costCents = 0;
      run.units = 0;
      runStartDay = shiftDateKey(day, 1);
      runStartReason = state === "slipped" ? "slip" : "missed";
      runStartedAt =
        state === "slipped"
          ? (totals?.lastSlip ?? runStartedAt)
          : phoenixMidnight(runStartDay);
    }
  }
  const stateOf = new Map(days.map((item) => [item.day, item.state]));
  return {
    asOf: asOf.toISOString(),
    today,
    yesterday,
    startDay,
    current,
    longest,
    settled,
    runStartDay,
    runStartedAt: new Date(runStartedAt).toISOString(),
    runStartReason,
    totalDays,
    slips,
    slipsThisMonth,
    lastSlipAt: lastSlip ? new Date(lastSlip).toISOString() : null,
    run,
    allTime,
    todayState: stateOf.get(today) ?? "pending",
    yesterdayState:
      yesterday >= startDay ? (stateOf.get(yesterday) ?? "pending") : null,
    days,
  };
}

export function isStreakMilestone(count: number) {
  return (
    (STREAK_MILESTONES as readonly number[]).includes(count) ||
    (count > YEAR && count % YEAR === 0)
  );
}

export function crossedMilestones(before: number, after: number) {
  const crossed: number[] = [];
  for (let count = Math.max(before, 0) + 1; count <= after; count++)
    if (isStreakMilestone(count)) crossed.push(count);
  return crossed;
}

export function nextMilestone(count: number) {
  return (
    STREAK_MILESTONES.find((milestone) => milestone > count) ??
    (Math.floor(count / YEAR) + 1) * YEAR
  );
}

export function highestMilestone(count: number) {
  if (count >= YEAR) return Math.floor(count / YEAR) * YEAR;
  return (
    [...STREAK_MILESTONES].reverse().find((milestone) => milestone <= count) ??
    null
  );
}

export function milestoneProgress(count: number) {
  const previous = highestMilestone(count) ?? 0;
  const next = nextMilestone(count);
  return {
    previous,
    next,
    remaining: next - count,
    fraction: Math.min(1, Math.max(0, (count - previous) / (next - previous))),
  };
}

export function streakTier(count: number): StreakTier {
  if (count >= 100) return "inferno";
  if (count >= 30) return "blaze";
  if (count >= 7) return "flame";
  return "spark";
}

export function streakActions(
  streak: { kind: StreakKind; status: StreakStatus },
  summary: Pick<
    StreakSummary,
    "today" | "yesterday" | "todayState" | "yesterdayState"
  >,
) {
  const active = streak.status === "ACTIVE";
  const yesterdayPending = summary.yesterdayState === "pending";
  const quit = streak.kind === "QUIT";
  return {
    // Quit days can only be confirmed once they are over.
    confirmDay: active && quit && yesterdayPending ? summary.yesterday : null,
    logDays:
      active && !quit
        ? [
            summary.today,
            ...(summary.yesterdayState === null ? [] : [summary.yesterday]),
          ]
        : [],
    canSlip: active && quit,
    needsLog:
      active &&
      (yesterdayPending || (!quit && summary.todayState === "pending")),
    breaksTonight: active && yesterdayPending,
  };
}

// Slips can be logged for any moment since the start of yesterday.
export function slipWindow(startedAt: DateLike, now = new Date()) {
  const start = phoenixMidnight(shiftDateKey(phoenixDateKey(now), -1));
  return {
    min: new Date(Math.max(start, new Date(startedAt).getTime())),
    max: now,
  };
}

export function isEntryDayOpen(day: string, now = new Date()) {
  return day >= shiftDateKey(phoenixDateKey(now), -1);
}

export type StreakHistoryEntry = {
  id: string;
  kind: StreakEntryKind;
  at: string;
  units: number | null;
  costCents: number | null;
  note: string | null;
  canUndo: boolean;
};

export type StreakHistoryDay = {
  day: string;
  state: StreakDayState;
  units: number;
  costCents: number;
  entries: StreakHistoryEntry[];
};

export function streakHistory(
  summary: Pick<StreakSummary, "days" | "yesterday">,
  entries: readonly (StreakEntrySource & { id: string; note: string | null })[],
  { canUndo, limit = 60 }: { canUndo: boolean; limit?: number },
): StreakHistoryDay[] {
  const byDay = new Map<string, StreakHistoryEntry[]>();
  for (const entry of entries) {
    const day = dayKeyOf(entry.day);
    const list = byDay.get(day) ?? [];
    list.push({
      id: entry.id,
      kind: entry.kind,
      at: new Date(entry.occurredAt).toISOString(),
      units: entry.units,
      costCents: entry.costCents,
      note: entry.note,
      canUndo: canUndo && day >= summary.yesterday,
    });
    byDay.set(day, list);
  }
  return summary.days
    .filter((item) => item.state !== "pending" || byDay.has(item.day))
    .reverse()
    .slice(0, limit)
    .map((item) => ({
      day: item.day,
      state: item.state,
      units: item.units,
      costCents: item.costCents,
      entries: (byDay.get(item.day) ?? []).sort((a, b) =>
        b.at.localeCompare(a.at),
      ),
    }));
}

export type StreakCardSummary = Omit<StreakSummary, "days"> & {
  // The last seven days. Days before the streak began have no state.
  week: { day: string; state: StreakDayState | null; units: number }[];
  highestMilestone: number | null;
};

export type StreakView = {
  id: string;
  circleId: string;
  title: string;
  emoji: string;
  kind: StreakKind;
  visibility: StreakVisibility;
  status: StreakStatus;
  startedAt: string;
  retiredAt: string | null;
  dailyCostCents: number | null;
  dailyUnits: number | null;
  unitLabel: string | null;
  owner: SocialAuthor;
  mine: boolean;
  nudged: boolean;
  summary: StreakCardSummary;
};

export function toCardSummary(summary: StreakSummary): StreakCardSummary {
  const { days, ...rest } = summary;
  const byDay = new Map(days.map((item) => [item.day, item]));
  return {
    ...rest,
    highestMilestone: highestMilestone(summary.longest),
    week: Array.from({ length: 7 }, (_, index) => {
      const day = shiftDateKey(summary.today, index - 6);
      const item = byDay.get(day);
      return { day, state: item?.state ?? null, units: item?.units ?? 0 };
    }),
  };
}

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const dollarsAndCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const unitNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatStreakMoney(cents: number) {
  return (cents % 100 === 0 ? wholeDollars : dollarsAndCents).format(
    cents / 100,
  );
}

export function formatStreakUnits(units: number, label: string | null) {
  const value = unitNumber.format(units / 100);
  return label ? `${value} ${label}` : value;
}

// Blank input means "not tracked" (null). Invalid input returns undefined.
function parseHundredths(value: string, money: boolean) {
  const clean = value.trim().replace(/,/g, "");
  if (!clean) return null;
  const match = (
    money ? /^\$?\s*(\d{1,7})(?:\.(\d{1,2}))?$/ : /^(\d{1,7})(?:\.(\d{1,2}))?$/
  ).exec(clean);
  if (!match) return undefined;
  const amount =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return amount >= 1 && amount <= MAX_AMOUNT ? amount : undefined;
}

export function parseMoneyInput(value: string) {
  return parseHundredths(value, true);
}

export function parseUnitsInput(value: string) {
  return parseHundredths(value, false);
}

export function hundredthsToInput(value: number | null) {
  if (value == null) return "";
  return value % 100 === 0
    ? String(value / 100)
    : (value / 100).toFixed(2).replace(/0$/, "");
}

export function formatElapsed(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const unit = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  if (days) return `${unit(days, "day")}, ${unit(hours, "hour")}`;
  if (hours) return `${unit(hours, "hour")}, ${unit(rest, "minute")}`;
  return rest ? unit(rest, "minute") : "less than a minute";
}

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

export function isSingleEmoji(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 16) return false;
  return (
    [...graphemes.segment(clean)].length === 1 &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(clean)
  );
}

const id = z.string().trim().min(1).max(100);
const amount = z.number().int().min(1).max(MAX_AMOUNT);
const note = z.string().trim().max(280, "Keep notes to 280 characters.");
const dayKey = z
  .string()
  .refine((value) => Boolean(parseDateKey(value)), "Choose a valid day.");

const streakDetails = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Name your streak.")
    .max(80, "Keep the name to 80 characters."),
  emoji: z.string().trim().refine(isSingleEmoji, "Pick one emoji."),
  dailyCostCents: amount.nullable().default(null),
  dailyUnits: amount.nullable().default(null),
  unitLabel: z
    .string()
    .trim()
    .min(1)
    .max(24, "Keep the unit to 24 characters.")
    .nullable()
    .default(null),
});

export type StreakDetailsInput = z.infer<typeof streakDetails>;

export function streakAmountError(
  details: Pick<
    StreakDetailsInput,
    "dailyCostCents" | "dailyUnits" | "unitLabel"
  >,
  kind: StreakKind,
) {
  if (kind === "BUILD" && details.dailyCostCents !== null)
    return "Money saved is only tracked for quit streaks.";
  if ((details.dailyUnits === null) !== (details.unitLabel === null))
    return "Add both an amount and a unit, or leave both blank.";
  return null;
}

export const createStreakSchema = streakDetails
  .extend({
    circleId: id,
    kind: z.enum(["QUIT", "BUILD"]),
    visibility: z.enum(["CIRCLE", "PRIVATE"]),
  })
  .superRefine((value, context) => {
    const message = streakAmountError(value, value.kind);
    if (message) context.addIssue({ code: "custom", message });
  });

export const streakActionSchema = z.discriminatedUnion("action", [
  streakDetails.extend({ action: z.literal("details") }),
  z.object({ action: z.literal("retire") }),
]);

export const streakEntrySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("clean"), day: dayKey, note: note.default("") }),
  z.object({
    action: z.literal("slip"),
    // Phoenix wall time from a datetime-local input. Omitted means now.
    occurredAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional(),
    note: note.default(""),
  }),
  z.object({
    action: z.literal("log"),
    day: dayKey,
    units: amount.nullable().default(null),
    note: note.default(""),
  }),
]);
