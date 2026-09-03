export const appTimeZone = "America/Phoenix";
export const maxPlanningDays = 7;

export function phoenixDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export function requireDateKey(value: string) {
  const date = parseDateKey(value);
  if (!date) throw new Error("Invalid calendar date.");
  return date;
}

export function addDays(value: string, days: number) {
  const date = parseDateKey(value);
  if (!date) throw new Error("Invalid calendar date.");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function phoenixDateTime(day: string, time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !parseDateKey(day)) {
    return null;
  }
  const date = new Date(`${day}T${time}:00-07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function phoenixDayDueAt(day: string) {
  if (!parseDateKey(day)) return null;
  const date = new Date(`${day}T23:59:59.999-07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isPlannableDay(day: string, now = new Date()) {
  const today = phoenixDateKey(now);
  return day >= today && day <= addDays(today, maxPlanningDays);
}

export function cadencePeriod(
  cadence: "DAILY" | "WEEKLY",
  anchor = phoenixDateKey(),
) {
  if (!parseDateKey(anchor)) throw new Error("Invalid period anchor.");
  if (cadence === "DAILY") return { start: anchor, end: anchor };

  const date = requireDateKey(anchor);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  const start = addDays(anchor, -mondayOffset);
  return { start, end: addDays(start, 6) };
}

export function isValidCadencePeriod(
  cadence: "DAILY" | "WEEKLY",
  start: string,
  end: string,
) {
  if (!parseDateKey(start) || !parseDateKey(end)) return false;
  return cadence === "DAILY" ? start === end : addDays(start, 6) === end;
}

export function formatPhoenixDate(
  value: Date,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    month: "short",
    day: "numeric",
    ...options,
  }).format(value);
}

const phoenixNoon = "T12:00:00-07:00";

function dayKeyToDate(dayKey: string) {
  return new Date(`${dayKey}${phoenixNoon}`);
}

export function formatDayLong(dayKey: string) {
  if (!parseDateKey(dayKey)) return dayKey;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(dayKeyToDate(dayKey));
}

export function formatDayShort(dayKey: string) {
  if (!parseDateKey(dayKey)) return dayKey;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(dayKeyToDate(dayKey));
}

export function isTodayKey(dayKey: string, now = new Date()) {
  return dayKey === phoenixDateKey(now);
}
