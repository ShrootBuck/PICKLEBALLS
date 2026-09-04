import { parseDateKey, phoenixWallToDate, requireDateKey } from "@/lib/time";

export function shiftDateKey(dayKey: string, days: number) {
  const date = requireDateKey(dayKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isMondayDateKey(dayKey: string) {
  const date = parseDateKey(dayKey);
  return date?.getUTCDay() === 1;
}

export function nextOrSameMonday(dayKey: string) {
  const date = requireDateKey(dayKey);
  const daysUntilMonday = (8 - date.getUTCDay()) % 7;
  return shiftDateKey(dayKey, daysUntilMonday);
}

export function timeblockWeek(dueMonday: string) {
  if (!isMondayDateKey(dueMonday)) {
    throw new Error("Timeblock due date must be a Monday.");
  }
  const startKey = shiftDateKey(dueMonday, -7);
  const endKey = shiftDateKey(dueMonday, -1);
  const startAt = phoenixWallToDate(startKey, 0, 0, 0, 0);
  const endAtExclusive = phoenixWallToDate(dueMonday, 0, 0, 0, 0);
  if (!startAt || !endAtExclusive) {
    throw new Error("Could not compute the timeblock week.");
  }
  return { dueMonday, startKey, endKey, startAt, endAtExclusive };
}
