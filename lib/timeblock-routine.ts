import { z } from "zod";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import { shiftDateKey, timeblockWeek } from "@/lib/timeblocks";

export const SCHOOL_PERIODS = [
  { period: "1", start: "07:30", end: "08:20" },
  { period: "2", start: "08:25", end: "09:20" },
  { period: "3", start: "09:25", end: "10:15" },
  { period: "4", start: "10:20", end: "11:10" },
  { period: "5", start: "11:15", end: "12:05" },
  { period: "6", start: "12:10", end: "13:00" },
  { period: "7", start: "13:05", end: "13:55" },
] as const;

const className = z.string().trim().max(160);
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const timeblockRoutineSchema = z.object({
  classes: z.object({
    "1": className,
    "2": className,
    "3": className,
    "5": className,
    "6": className,
    "7": className,
  }),
  sleep: z
    .object({ bedtime: clockTime, wakeTime: clockTime })
    .refine((sleep) => sleep.bedtime !== sleep.wakeTime, {
      message: "Bedtime and wake time must be different.",
    })
    .nullable(),
});
export type TimeblockRoutine = z.infer<typeof timeblockRoutineSchema>;
export const EMPTY_ROUTINE: TimeblockRoutine = {
  classes: { "1": "", "2": "", "3": "", "5": "", "6": "", "7": "" },
  sleep: null,
};
export function parseTimeblockRoutine(value: unknown): TimeblockRoutine {
  const parsed = timeblockRoutineSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_ROUTINE;
}

export function isRoutineBlock(id: string) {
  return id.startsWith("routine-");
}

// Shared by the calendar, AI context, and PDF. Routine blocks never consume
// the user's 56 work slots and cannot masquerade as verified work.
export function routineBlocks(
  dueMonday: string,
  routine: TimeblockRoutine,
): TimeblockDraftRow[] {
  const week = timeblockWeek(dueMonday);
  const rows: TimeblockDraftRow[] = [];
  const add = (
    id: string,
    title: string,
    startedAt: string,
    completedAt: string,
  ) => {
    rows.push({
      id: `routine-${id}`,
      title,
      startedAt,
      completedAt,
      status: null,
      included: true,
    });
  };
  for (let day = 0; day < 7; day++) {
    const date = shiftDateKey(week.startKey, day);
    if (day < 5)
      for (const { period, start, end } of SCHOOL_PERIODS) {
        const title =
          period === "4" ? "Lunch" : routine.classes[period] || "Class";
        add(
          `school-${date}-${period}`,
          `Period ${period} - ${title}`,
          `${date}T${start}`,
          `${date}T${end}`,
        );
      }
    if (routine.sleep) {
      const { bedtime, wakeTime } = routine.sleep;
      if (bedtime < wakeTime) {
        add(
          `sleep-${date}`,
          "Sleep",
          `${date}T${bedtime}`,
          `${date}T${wakeTime}`,
        );
      } else {
        // Clip both sides of midnight, including Monday morning and Sunday night.
        if (wakeTime !== "00:00")
          add(
            `sleep-am-${date}`,
            "Sleep",
            `${date}T00:00`,
            `${date}T${wakeTime}`,
          );
        add(
          `sleep-pm-${date}`,
          "Sleep",
          `${date}T${bedtime}`,
          `${shiftDateKey(date, 1)}T00:00`,
        );
      }
    }
  }
  return rows;
}
