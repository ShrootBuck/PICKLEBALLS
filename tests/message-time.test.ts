import { expect, test } from "bun:test";
import {
  formatConversationTime,
  formatThreadDivider,
} from "@/lib/message-time";

const now = new Date("2026-10-15T01:30:00Z"); // Oct 14, 6:30 PM in Tucson.

test("inbox timestamps use time today, yesterday, recent weekdays, and older dates", () => {
  expect(formatConversationTime("2026-10-15T01:05:00Z", now)).toBe("6:05 PM");
  expect(formatConversationTime("2026-10-14T06:55:00Z", now)).toBe("Yesterday");
  expect(formatConversationTime("2026-10-13T20:00:00Z", now)).toBe("Yesterday");
  expect(formatConversationTime("2026-10-12T20:00:00Z", now)).toBe("Monday");
  expect(formatConversationTime("2026-10-08T20:00:00Z", now)).toBe("Thursday");
  expect(formatConversationTime("2026-10-07T20:00:00Z", now)).toBe("Oct 7");
  expect(formatConversationTime("2025-12-31T20:00:00Z", now)).toBe(
    "Dec 31, 2025",
  );
});

test("midnight changes the label even when a message is only minutes old", () => {
  expect(
    formatConversationTime(
      "2026-10-15T06:59:00Z",
      new Date("2026-10-15T07:01:00Z"),
    ),
  ).toBe("Yesterday");
  expect(
    formatConversationTime(
      "2026-10-15T07:00:00Z",
      new Date("2026-10-15T07:01:00Z"),
    ),
  ).toBe("12:00 AM");
});

test("inbox dates follow the viewer's zone, including daylight-saving transitions", () => {
  const message = "2026-10-15T01:05:00Z";
  expect(formatConversationTime(message, now, "America/New_York")).toBe(
    "9:05 PM",
  );
  // Spring-forward Sunday is only 23 hours; Monday's previous day is still Yesterday.
  expect(
    formatConversationTime(
      "2026-03-08T05:30:00Z",
      new Date("2026-03-09T04:15:00Z"),
      "America/New_York",
    ),
  ).toBe("Yesterday");
  // The fall-back day is 25 hours. Use calendar boundaries, not duration.
  expect(
    formatConversationTime(
      "2026-11-01T04:30:00Z",
      new Date("2026-11-02T05:15:00Z"),
      "America/New_York",
    ),
  ).toBe("Yesterday");
});

test("thread dividers name the day and keep the time", () => {
  expect(formatThreadDivider("2026-10-15T01:05:00Z", now)).toEqual({
    day: "Today",
    time: "6:05 PM",
  });
  expect(formatThreadDivider("2026-10-13T20:00:00Z", now)).toEqual({
    day: "Yesterday",
    time: "1:00 PM",
  });
  expect(formatThreadDivider("2026-10-07T20:00:00Z", now)).toEqual({
    day: "Oct 7",
    time: "1:00 PM",
  });
});
