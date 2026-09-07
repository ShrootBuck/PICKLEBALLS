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
  dailyAverageMinutes: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .nullable()
    .describe(
      "Visible daily average, including Last Week’s Average; null if unreadable.",
    ),
  totalMinutes: z.number().int().min(0).max(10080).nullable(),
});

export function validateScreenTimeExtraction(raw: unknown) {
  const parsed = screenTimeExtractionSchema.safeParse(raw);
  if (!parsed.success)
    throw new DomainError(
      "Could not read the report reliably. Try a clearer screenshot.",
    );
  const value = parsed.data;
  if (!value.isWeeklyReport)
    throw new DomainError(
      "Choose Week in Screen Time, go back one week, and screenshot the average.",
    );
  if (value.dailyAverageMinutes === null)
    throw new DomainError(
      "Could not read the daily average. Upload a clearer screenshot with the average visible.",
    );
  // The user selects last week; the server assigns the reporting week.
  // An optional total must never block a readable average. Omit inconsistent
  // totals instead of rejecting the screenshot or inventing a replacement.
  const totalMinutes =
    value.totalMinutes !== null &&
    Math.abs(value.totalMinutes - value.dailyAverageMinutes * 7) <= 7
      ? value.totalMinutes
      : null;
  return {
    dailyAverageMinutes: value.dailyAverageMinutes,
    totalMinutes,
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
