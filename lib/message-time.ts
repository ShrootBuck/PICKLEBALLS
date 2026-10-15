import { appTimeZone } from "@/lib/time";

// Compare calendar days in the display zone, not elapsed 24-hour periods.
// Midnight and daylight-saving transitions should behave like a phone inbox.
function calendarDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((value) => value.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

export function formatConversationTime(
  value: string,
  now: Date,
  timeZone = appTimeZone,
) {
  const date = new Date(value);
  const days =
    (calendarDay(now, timeZone) - calendarDay(date, timeZone)) / 86_400_000;
  if (days <= 0) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((value) => value.type === type)?.value ?? "";
    return `${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7)
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
    }).format(date);
  const year = (value: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(
      value,
    );
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(year(date) !== year(now) ? { year: "numeric" as const } : {}),
  }).format(date);
}

export function formatMessageTimestamp(value: string, timeZone = appTimeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}
