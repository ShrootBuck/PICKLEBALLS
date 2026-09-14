import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  applyReportEdit,
  overlappingIds,
  reportFingerprint,
} from "@/lib/timeblock-editor";
import {
  createTimeblockPdf,
  timeblockPrintDays,
  wrapPdfText,
} from "@/lib/timeblock-pdf";
import {
  EMPTY_ROUTINE,
  routineBlocks,
  SCHOOL_PERIODS,
  timeblockRoutineSchema,
} from "@/lib/timeblock-routine";

const due = "2026-09-14";
const routine = {
  classes: {
    "1": "Physics",
    "2": "Calculus",
    "3": "Literature",
    "5": "History",
    "6": "Computer Science",
    "7": "Spanish",
  },
  sleep: { bedtime: "22:00", wakeTime: "06:00" },
};

describe("school and sleep", () => {
  test("exact bell times, fixed lunch, five weekdays and no weekend school", () => {
    const blocks = routineBlocks(due, routine);
    const school = blocks.filter((r) => r.id.includes("school"));
    expect(school).toHaveLength(35);
    expect(
      school
        .slice(0, 7)
        .map((r) => [r.startedAt.slice(11), r.completedAt.slice(11)]),
    ).toEqual([
      ["07:30", "08:20"],
      ["08:25", "09:20"],
      ["09:25", "10:15"],
      ["10:20", "11:10"],
      ["11:15", "12:05"],
      ["12:10", "13:00"],
      ["13:05", "13:55"],
    ]);
    expect(school.filter((r) => r.title === "Period 4 - Lunch")).toHaveLength(
      5,
    );
    expect(school.every((r) => r.startedAt < "2026-09-12")).toBe(true);
    expect(school[0].title).toBe("Period 1 - Physics");
    expect(new Set(blocks.map((r) => r.id)).size).toBe(blocks.length);
    expect(blocks.every((r) => r.included && r.status === null)).toBe(true);
    expect(SCHOOL_PERIODS).toHaveLength(7);
  });
  test("overnight sleep covers every day including both week boundaries", () => {
    const sleep = routineBlocks(due, routine).filter(
      (r) => r.title === "Sleep",
    );
    expect(sleep).toHaveLength(14);
    expect(sleep[0].startedAt).toBe("2026-09-07T00:00");
    expect(sleep.at(-1)?.completedAt).toBe("2026-09-14T00:00");
    const hours = sleep.reduce(
      (sum, r) =>
        sum + (Date.parse(r.completedAt) - Date.parse(r.startedAt)) / 3_600_000,
      0,
    );
    expect(hours).toBe(56);
    expect([...overlappingIds(sleep)]).toHaveLength(0);
  });
  test("supports sleep after midnight and ending at midnight without zero-length blocks", () => {
    for (const [bedtime, wakeTime] of [
      ["01:00", "07:00"],
      ["18:00", "00:00"],
      ["00:00", "06:00"],
    ]) {
      const sleep = routineBlocks(due, {
        ...routine,
        sleep: { bedtime, wakeTime },
      }).filter((r) => r.title === "Sleep");
      expect(sleep).toHaveLength(7);
      expect(sleep.every((r) => r.startedAt < r.completedAt)).toBe(true);
    }
  });
  test("no invented sleep and invalid settings fail", () => {
    expect(routineBlocks(due, EMPTY_ROUTINE)).toHaveLength(35);
    for (const sleep of [
      { bedtime: "22:00", wakeTime: "22:00" },
      { bedtime: "24:00", wakeTime: "06:00" },
      { bedtime: "22:00", wakeTime: "6:00" },
    ]) {
      expect(
        timeblockRoutineSchema.safeParse({ ...routine, sleep }).success,
      ).toBe(false);
    }
  });
  test("work overlapping school or sleep is surfaced", () => {
    const work = {
      id: "manual-1",
      title: "Homework",
      startedAt: "2026-09-07T07:45",
      completedAt: "2026-09-07T08:00",
      included: true,
      status: null,
    };
    expect(
      overlappingIds([work, ...routineBlocks(due, routine)]).has(work.id),
    ).toBe(true);
    expect(
      overlappingIds([
        {
          ...work,
          startedAt: "2026-09-07T23:00",
          completedAt: "2026-09-07T23:30",
        },
        ...routineBlocks(due, routine),
      ]).has(work.id),
    ).toBe(true);
  });
  test("AI routine-only changes are atomic and fingerprint includes settings", () => {
    const edit = {
      summary: "Set sleep and classes",
      upserts: [],
      removeIds: [],
      routine,
    };
    expect(applyReportEdit([], EMPTY_ROUTINE, edit, due)).toEqual({
      rows: [],
      routine,
    });
    expect(reportFingerprint([], EMPTY_ROUTINE)).not.toBe(
      reportFingerprint([], routine),
    );
    expect(() =>
      applyReportEdit(
        [],
        EMPTY_ROUTINE,
        { ...edit, removeIds: ["missing"] },
        due,
      ),
    ).toThrow();
    expect(() =>
      applyReportEdit(
        [],
        EMPTY_ROUTINE,
        {
          ...edit,
          routine: {
            ...routine,
            sleep: { bedtime: "22:00", wakeTime: "22:00" },
          },
        },
        due,
      ),
    ).toThrow();
    expect(
      applyReportEdit([], routine, { ...edit, routine: null }, due).routine,
    ).toEqual(routine);
  });
});

describe("printed calendar", () => {
  test("full numbered titles for short work, both halves of midnight, recurring school and sleep", () => {
    const days = timeblockPrintDays({
      dueMonday: due,
      routine,
      tasks: [
        {
          id: "short",
          title: "A complete five-minute task title",
          startedAt: new Date("2026-09-08T06:58:00Z"),
          completedAt: new Date("2026-09-08T07:03:00Z"),
        },
      ],
    });
    expect(
      days[0].blocks.some(
        (b) => b.label === "#1 - A complete five-minute task title",
      ),
    ).toBe(true);
    expect(
      days[1].blocks.some(
        (b) => b.label === "#1 - A complete five-minute task title",
      ),
    ).toBe(true);
    expect(days[0].blocks.some((b) => b.label === "Period 4 - Lunch")).toBe(
      true,
    );
    expect(days[6].blocks.filter((b) => b.label === "Sleep")).toHaveLength(2);
    expect(days[6].blocks.some((b) => b.label.includes("Period"))).toBe(false);
  });
  test("wrapping never loses words or clips long unbroken titles", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.HelveticaBold);
    for (const title of [
      "#23 - Finish the full physics problem set and explain each solution",
      "W".repeat(160),
    ]) {
      const lines = wrapPdfText(title, 158, font, 9);
      expect(lines.join("").replaceAll(" ", "")).toBe(
        title.replaceAll(" ", ""),
      );
      expect(
        lines.every((line) => font.widthOfTextAtSize(line, 9) <= 158),
      ).toBe(true);
    }
  });
  test("crowded reports paginate instead of losing titles", async () => {
    const tasks = Array.from({ length: 56 }, (_, i) => ({
      id: `manual-${i}`,
      title: `Task ${i}: ${"Detailed assignment instructions ".repeat(4)}`,
      startedAt: new Date("2026-09-07T21:00:00Z"),
      completedAt: new Date("2026-09-07T21:05:00Z"),
    }));
    const pdf = await PDFDocument.load(
      await createTimeblockPdf({
        studentName: "Test Student",
        dueMonday: due,
        routine,
        tasks,
      }),
    );
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(
      pdf
        .getPages()
        .every((page) => page.getWidth() === 792 && page.getHeight() === 612),
    ).toBe(true);
  });
});
