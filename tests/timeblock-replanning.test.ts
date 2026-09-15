import { describe, expect, test } from "bun:test";
import { timeblockPdfSchema } from "@/lib/schemas";
import {
  compareTimeblockRows,
  parseTimeblockDraft,
  type TimeblockDraftRow,
} from "@/lib/timeblock-draft";
import {
  applyReportEdit,
  inspectReport,
  reportFingerprint,
} from "@/lib/timeblock-editor";
import { orderedPrintTasks, timeblockPrintDays } from "@/lib/timeblock-pdf";
import {
  EMPTY_ROUTINE,
  parseTimeblockRoutine,
  routineBlocks,
  type TimeblockRoutine,
  timeblockRoutineSchema,
} from "@/lib/timeblock-routine";

const due = "2026-09-14";
const custom: TimeblockRoutine = {
  ...EMPTY_ROUTINE,
  schedule: [
    {
      id: "school",
      title: "School",
      days: [0, 1, 2, 3, 4],
      start: "07:30",
      end: "14:00",
    },
    {
      id: "lunch",
      title: "Lunch",
      days: [0, 1, 2, 3, 4],
      start: "14:00",
      end: "15:00",
    },
  ],
  sleep: { bedtime: "22:00", wakeTime: "06:00" },
  listOrder: "category",
};
const row: TimeblockDraftRow = {
  id: "proof-1",
  title: "Physics",
  category: "Science",
  status: "VERIFIED",
  included: true,
  startedAt: "2026-09-07T16:00",
  completedAt: "2026-09-07T17:00",
};

describe("whole-week replanning", () => {
  test("the screenshot request replaces default school and lunch without duplicates", () => {
    const blocks = routineBlocks(due, custom);
    expect(blocks.filter((b) => b.title === "School")).toHaveLength(5);
    expect(blocks.filter((b) => b.title === "Lunch")).toHaveLength(5);
    expect(blocks.some((b) => b.title.includes("Period"))).toBe(false);
    const report = inspectReport([row], custom, due);
    expect(report.conflicts).toEqual([]);
    expect(report.days[0].free).toEqual([
      { startMinute: 360, endMinute: 450 },
      { startMinute: 900, endMinute: 960 },
      { startMinute: 1020, endMinute: 1320 },
    ]);
    expect(report.days[5].free).toEqual([
      { startMinute: 360, endMinute: 1320 },
    ]);
  });

  test("custom overnight routines carry into Monday and clip at the end of the week", () => {
    const blocks = routineBlocks(due, {
      ...EMPTY_ROUTINE,
      schedule: [
        {
          id: "overnight",
          title: "Sleep",
          days: [6],
          start: "23:00",
          end: "08:00",
        },
      ],
    });
    expect(blocks.map((b) => [b.startedAt, b.completedAt])).toEqual([
      ["2026-09-07T00:00", "2026-09-07T08:00"],
      ["2026-09-13T23:00", "2026-09-14T00:00"],
    ]);
  });

  test("an empty custom schedule disables school and null restores it", () => {
    expect(routineBlocks(due, { ...EMPTY_ROUTINE, schedule: [] })).toHaveLength(
      0,
    );
    expect(
      routineBlocks(due, { ...EMPTY_ROUTINE, schedule: null }),
    ).toHaveLength(35);
    expect(parseTimeblockRoutine(EMPTY_ROUTINE)).toEqual(EMPTY_ROUTINE);
  });

  test("invalid routines fail atomically without losing the old draft", () => {
    for (const block of [
      { ...custom.schedule?.[0], days: [0, 0] },
      { ...custom.schedule?.[0], days: [7] },
      { ...custom.schedule?.[0], end: "07:30" },
      { ...custom.schedule?.[0], start: "25:00" },
    ]) {
      expect(
        timeblockRoutineSchema.safeParse({ ...custom, schedule: [block] })
          .success,
      ).toBe(false);
    }
    const before = reportFingerprint([row], custom);
    expect(() =>
      applyReportEdit(
        [row],
        custom,
        {
          summary: "Bad batch",
          upserts: [{ ...row, title: "Changed", completedAt: row.startedAt }],
          removeIds: [],
          routine: EMPTY_ROUTINE,
        },
        due,
      ),
    ).toThrow();
    expect(reportFingerprint([row], custom)).toBe(before);
  });

  test("large rewrites preserve proof status, categories, and omitted routine settings", () => {
    const upserts = Array.from({ length: 100 }, (_, i) => ({
      ...row,
      id: `manual-${i}`,
      status: null,
    }));
    const next = applyReportEdit(
      [row],
      custom,
      {
        summary: "Rewrite the week",
        upserts: [
          {
            ...row,
            startedAt: "2026-09-08T16:00",
            completedAt: "2026-09-08T18:00",
          },
          ...upserts,
        ],
        removeIds: [],
        routine: { ...EMPTY_ROUTINE, sleep: custom.sleep },
      },
      due,
    );
    expect(next.rows).toHaveLength(101);
    expect(next.rows[0].status).toBe("VERIFIED");
    expect(next.routine.schedule).toEqual(custom.schedule);
    expect(next.routine.listOrder).toBe("category");
    const restored = parseTimeblockDraft(
      JSON.stringify({ version: 1, rows: next.rows }),
    );
    expect(restored).toEqual(next.rows);
    const renamed = applyReportEdit(
      [row],
      custom,
      {
        summary: "Rename",
        upserts: [
          {
            id: row.id,
            title: "New title",
            startedAt: row.startedAt,
            completedAt: row.completedAt,
            included: true,
          },
        ],
        removeIds: [],
        routine: null,
      },
      due,
    );
    expect(renamed.rows[0].category).toBe("Science");
    expect(reportFingerprint([row], custom)).not.toBe(
      reportFingerprint([{ ...row, category: "Other" }], custom),
    );
  });

  test("category ordering reaches PDF input and uses matching calendar numbers", () => {
    const rows = [
      row,
      {
        ...row,
        id: "manual-2",
        title: "Essay",
        category: "Applications",
        startedAt: "2026-09-09T16:00",
        completedAt: "2026-09-09T17:00",
      },
    ];
    expect(
      [...rows].sort((a, b) => compareTimeblockRows(a, b, "category"))[0].title,
    ).toBe("Essay");
    const parsed = timeblockPdfSchema.parse({
      dueMonday: due,
      routine: custom,
      tasks: rows,
    });
    expect(parsed.tasks[1].category).toBe("Applications");
    const tasks = parsed.tasks.map((task) => ({
      ...task,
      startedAt: new Date(`${task.startedAt}:00-07:00`),
      completedAt: new Date(`${task.completedAt}:00-07:00`),
    }));
    expect(orderedPrintTasks(tasks, "category")[0].title).toBe("Essay");
    const days = timeblockPrintDays({ dueMonday: due, routine: custom, tasks });
    expect(days[0].blocks.some((b) => b.label === "#2 - Physics")).toBe(true);
    expect(days[2].blocks.some((b) => b.label === "#1 - Essay")).toBe(true);
  });
});
