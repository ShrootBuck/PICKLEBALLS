export const appTimeZone = "America/Phoenix";

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

export function phoenixDayDueAt(day: string) {
  if (!parseDateKey(day)) return null;
  const date = new Date(`${day}T23:59:59.999-07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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
