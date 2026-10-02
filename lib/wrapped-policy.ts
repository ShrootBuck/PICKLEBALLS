import { DomainError } from "@/lib/errors";
import {
  isScreenTimeWeek,
  latestScreenTimeWeek,
  screenTimeWeekLabel,
} from "@/lib/screen-time";
import { phoenixDateKey, phoenixWallToDate, requireDateKey } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

export function wrappedWeek(value?: string, now = new Date()) {
  const latest = latestScreenTimeWeek(now);
  const startKey = value ?? latest;
  if (!isScreenTimeWeek(startKey, latest) || startKey < "2020-01-05")
    throw new DomainError("Choose a completed Sunday-to-Saturday week.", 400);
  const endKey = shiftDateKey(startKey, 6);
  return {
    startKey,
    endKey,
    latest,
    label: screenTimeWeekLabel(startKey),
    startAt: phoenixWallToDate(startKey, 0, 0, 0, 0) as Date,
    endAt: phoenixWallToDate(shiftDateKey(startKey, 7), 0, 0, 0, 0) as Date,
  };
}

export function firstWrappedWeek(createdAt: Date) {
  const day = phoenixDateKey(createdAt);
  return shiftDateKey(day, -requireDateKey(day).getUTCDay());
}

export function screenTimeImprovement(
  current: number | null,
  previous: number | null,
) {
  if (
    current === null ||
    previous === null ||
    previous <= 0 ||
    current >= previous
  )
    return null;
  return {
    minutes: previous - current,
    percent: Math.round(((previous - current) / previous) * 100),
  };
}
