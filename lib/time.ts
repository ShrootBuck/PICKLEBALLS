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
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

export function requireDateKey(value: string) {
  const date = parseDateKey(value);
  if (!date) throw new Error("Invalid calendar date.");
  return date;
}

// Offset of a wall-clock zone at a given instant, in minutes. Positive east
// of UTC. Derived from Intl so DST rule changes never silently break us.
function zoneOffsetMinutes(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value ?? 0);
  // Intl can report midnight as hour 24. Normalize before math.
  const hour = get("hour") % 24;
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

// A Phoenix wall-clock time on a calendar day, as an instant.
export function phoenixWallToDate(
  dayKey: string,
  hour: number,
  minute: number,
  second: number,
  ms: number,
) {
  if (!parseDateKey(dayKey)) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  // Guess with the offset at noon, then refine once. One pass is exact for
  // zones without a mid-day transition (Phoenix has no DST at all).
  const noonUTC = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  const offset = zoneOffsetMinutes(appTimeZone, new Date(noonUTC));
  const date = new Date(
    Date.UTC(y, m - 1, d, hour, minute, second, ms) - offset * 60000,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function phoenixLocalDateTimeValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour") === "24" ? "00" : part("hour")}:${part("minute")}`;
}

export function parsePhoenixLocalDateTime(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return null;
  const date = phoenixWallToDate(match[1], hour, minute, 0, 0);
  if (!date || phoenixLocalDateTimeValue(date) !== value.trim()) return null;
  return date;
}

export function phoenixDayDueAt(day: string) {
  // 23:59:59.999 Phoenix wall time, whatever the current UTC offset is.
  return phoenixWallToDate(day, 23, 59, 59, 999);
}

function dayKeyToDate(dayKey: string) {
  return new Date(`${dayKey}T12:00:00.000Z`);
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

// Shared Phoenix-time formatters. Module-level so render loops never
// construct Intl.DateTimeFormat per row.
const replyTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: appTimeZone,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const historyTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: appTimeZone,
  hour: "numeric",
  minute: "2-digit",
});

const proofTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: appTimeZone,
  dateStyle: "short",
  timeStyle: "short",
});

export function formatReplyTime(date: Date | string) {
  return replyTimeFormatter.format(new Date(date));
}

export function formatHistoryTime(date: Date | string) {
  return historyTimeFormatter.format(new Date(date));
}

export function formatProofTime(date: Date | string) {
  return proofTimeFormatter.format(new Date(date));
}
