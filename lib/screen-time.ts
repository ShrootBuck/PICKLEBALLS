import { z } from "zod";
import { DomainError } from "@/lib/errors";
import {
  formatDayShort,
  parseDateKey,
  phoenixDateKey,
  requireDateKey,
} from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

export function latestScreenTimeWeek(now = new Date()) {
  const today = phoenixDateKey(now);
  return shiftDateKey(today, -requireDateKey(today).getUTCDay() - 7);
}

export function screenTimeWeekLabel(start: string) {
  return `${formatDayShort(start)} – ${formatDayShort(shiftDateKey(start, 6))}`;
}

export function isScreenTimeWeek(value: string, latest: string) {
  const date = parseDateKey(value);
  return Boolean(date && date.getUTCDay() === 0 && value <= latest);
}

export function formatScreenTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

export const screenTimeExtractionSchema = z.object({
  isWeeklyReport: z.boolean(),
  isCompleteWeek: z.boolean(),
  deviceScope: z.enum(["PHONE", "ALL_DEVICES", "OTHER", "UNKNOWN"]),
  weekStart: z
    .string()
    .nullable()
    .describe("Visible first date, YYYY-MM-DD; null if unreadable."),
  weekEnd: z
    .string()
    .nullable()
    .describe("Visible last date, YYYY-MM-DD; null if unreadable."),
  dailyAverageMinutes: z.number().int().min(0).max(1440).nullable(),
  totalMinutes: z.number().int().min(0).max(10080).nullable(),
  problem: z
    .string()
    .max(300)
    .nullable()
    .describe("Any ambiguity that prevents a reliable read; otherwise null."),
});

export function validateScreenTimeExtraction(
  raw: unknown,
  expectedWeek: string,
) {
  const parsed = screenTimeExtractionSchema.safeParse(raw);
  if (!parsed.success)
    throw new DomainError(
      "Could not read the report reliably. Try a clearer screenshot.",
    );
  const value = parsed.data;
  if (!value.isWeeklyReport || !value.isCompleteWeek)
    throw new DomainError(
      "Choose Week, then go back to the completed week. Keep the date range and daily average visible.",
    );
  if (
    value.weekStart !== expectedWeek ||
    value.weekEnd !== shiftDateKey(expectedWeek, 6)
  )
    throw new DomainError(
      `Use the report for ${screenTimeWeekLabel(expectedWeek)}. Go back one week from This Week.`,
    );
  if (value.deviceScope !== "PHONE")
    throw new DomainError(
      "Select just your iPhone under Devices, not All Devices, and keep the device name visible.",
    );
  if (value.dailyAverageMinutes === null || value.problem)
    throw new DomainError(
      "The daily average or report details are unclear. Upload a clearer screenshot with the full header.",
    );
  // Both displayed numbers are rounded to minutes. Do not invent a weekly total.
  if (
    value.totalMinutes !== null &&
    Math.abs(value.totalMinutes - value.dailyAverageMinutes * 7) > 7
  )
    throw new DomainError(
      "The total and daily average do not agree. Check that this is a complete seven-day report.",
    );
  return {
    dailyAverageMinutes: value.dailyAverageMinutes,
    totalMinutes: value.totalMinutes,
  };
}

export type ScreenTimeStanding = {
  userId: string;
  name: string;
  dailyAverageMinutes: number | null;
  previousDailyAverageMinutes: number | null;
  mediaId: string | null;
};

export function rankScreenTime(rows: ScreenTimeStanding[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      (a.dailyAverageMinutes ?? Number.POSITIVE_INFINITY) -
        (b.dailyAverageMinutes ?? Number.POSITIVE_INFINITY) ||
      a.name.localeCompare(b.name),
  );
  let rank = 0;
  return sorted.map((row, index) => {
    if (
      row.dailyAverageMinutes !== null &&
      (index === 0 ||
        row.dailyAverageMinutes !== sorted[index - 1].dailyAverageMinutes)
    )
      rank = index + 1;
    return {
      ...row,
      rank: row.dailyAverageMinutes === null ? null : rank,
      improvement:
        row.dailyAverageMinutes !== null &&
        row.previousDailyAverageMinutes !== null
          ? row.previousDailyAverageMinutes - row.dailyAverageMinutes
          : null,
    };
  });
}
