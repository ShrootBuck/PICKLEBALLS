import { describe, expect, test } from "bun:test";
import { blockDuration, calendarDaySegments } from "@/lib/timeblock-calendar";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";

const day = "2026-09-08";
function block(id: string, start: string, end: string): TimeblockDraftRow {
  return {
    id,
    title: id,
    startedAt: `${day}T${start}`,
    completedAt: `${day}T${end}`,
    included: true,
    status: null,
  };
}

describe("calendar layout", () => {
  test("only overlapping groups share width, including chained overlaps", () => {
    const rows = [
      block("a", "08:00", "09:00"),
      block("b", "08:30", "10:00"),
      block("c", "09:00", "09:30"),
      block("d", "10:00", "11:00"),
    ];
    const segments = calendarDaySegments(rows, day);
    expect(segments.map(({ lane, lanes }) => [lane, lanes])).toEqual([
      [0, 2],
      [1, 2],
      [0, 2],
      [0, 1],
    ]);
    expect(rows[0]).not.toHaveProperty("lane");
  });
  test("clips overnight work at midnight and skips invalid or excluded blocks", () => {
    const overnight = {
      ...block("night", "23:30", "01:00"),
      completedAt: "2026-09-09T01:00",
    };
    const rows = [
      overnight,
      block("reverse", "09:00", "08:00"),
      block("zero", "09:00", "09:00"),
      { ...block("hidden", "12:00", "13:00"), included: false },
    ];
    expect(
      calendarDaySegments(rows, day).map(({ start, end }) => [start, end]),
    ).toEqual([[1410, 1440]]);
    expect(
      calendarDaySegments(rows, "2026-09-09").map(({ start, end }) => [
        start,
        end,
      ]),
    ).toEqual([[0, 60]]);
    expect(calendarDaySegments(rows, "2026-09-10")).toEqual([]);
  });
  test("handles three simultaneous blocks and an independent later group", () => {
    const segments = calendarDaySegments(
      [
        block("long", "08:00", "12:00"),
        block("short", "08:00", "09:00"),
        block("third", "08:30", "09:00"),
        block("later", "13:00", "14:00"),
      ],
      day,
    );
    expect(segments.map(({ lanes }) => lanes)).toEqual([3, 3, 3, 1]);
  });
  test("formats durations across midnight and rejects invalid times", () => {
    expect(blockDuration(`${day}T23:30`, "2026-09-09T01:00")).toBe("1h 30m");
    expect(blockDuration(`${day}T08:00`, `${day}T09:00`)).toBe("1h");
    expect(blockDuration(`${day}T08:00`, `${day}T08:05`)).toBe("5m");
    expect(blockDuration(`${day}T09:00`, `${day}T08:00`)).toBeNull();
    expect(blockDuration("invalid", `${day}T09:00`)).toBeNull();
  });
});
