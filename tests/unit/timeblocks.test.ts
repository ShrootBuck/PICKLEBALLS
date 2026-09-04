import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import {
  parsePhoenixLocalDateTime,
  phoenixLocalDateTimeValue,
} from "@/lib/time";
import { createTimeblockPdf } from "@/lib/timeblock-pdf";
import {
  isMondayDateKey,
  nextOrSameMonday,
  shiftDateKey,
  timeblockWeek,
} from "@/lib/timeblocks";

describe("timeblock week", () => {
  test("uses the full Monday through Sunday before the due Monday", () => {
    const week = timeblockWeek("2026-09-07");
    expect(week.startKey).toBe("2026-08-31");
    expect(week.endKey).toBe("2026-09-06");
    expect(week.startAt.toISOString()).toBe("2026-08-31T07:00:00.000Z");
    expect(week.endAtExclusive.toISOString()).toBe("2026-09-07T07:00:00.000Z");
  });

  test("finds the current or upcoming due Monday", () => {
    expect(nextOrSameMonday("2026-09-04")).toBe("2026-09-07");
    expect(nextOrSameMonday("2026-09-07")).toBe("2026-09-07");
    expect(isMondayDateKey("2026-09-07")).toBe(true);
    expect(isMondayDateKey("2026-09-08")).toBe(false);
    expect(shiftDateKey("2026-01-01", -7)).toBe("2025-12-25");
  });
});

describe("Phoenix local date-time fields", () => {
  test("round trips without using the browser time zone", () => {
    const input = "2026-09-04T16:30";
    const date = parsePhoenixLocalDateTime(input);
    expect(date?.toISOString()).toBe("2026-09-04T23:30:00.000Z");
    if (!date) throw new Error("Expected a valid Phoenix time.");
    expect(phoenixLocalDateTimeValue(date)).toBe(input);
  });

  test("rejects impossible wall-clock values", () => {
    expect(parsePhoenixLocalDateTime("2026-09-04T25:00")).toBeNull();
    expect(parsePhoenixLocalDateTime("2026-02-30T12:00")).toBeNull();
  });
});

describe("timeblock PDF", () => {
  test("creates one task-list page and one schedule page", async () => {
    const bytes = await createTimeblockPdf({
      studentName: "Zayd Krunz",
      dueMonday: "2026-09-07",
      tasks: [
        {
          id: "task-1",
          title: "Reading Log",
          startedAt: new Date("2026-09-02T22:00:00.000Z"),
          completedAt: new Date("2026-09-02T22:30:00.000Z"),
        },
      ],
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(2);
    expect(document.getPage(0).getSize()).toEqual({
      width: 792,
      height: 612,
    });
    expect(document.getPage(1).getSize()).toEqual({
      width: 792,
      height: 612,
    });
  });
});
