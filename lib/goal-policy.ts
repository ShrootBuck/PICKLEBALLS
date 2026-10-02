import { z } from "zod";
import { parseDateKey } from "@/lib/time";

export const MAX_GOAL_MILESTONES = 20;
const id = z.string().trim().min(1).max(100);
const milestoneTitle = z.string().trim().min(1).max(160);
export const goalDetailsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1500).default(""),
  targetDate: z
    .string()
    .refine(
      (value) => !value || Boolean(parseDateKey(value)),
      "Choose a valid target date.",
    )
    .default(""),
});
export const createGoalSchema = goalDetailsSchema.extend({
  circleId: id,
  milestones: z.array(milestoneTitle).max(MAX_GOAL_MILESTONES).default([]),
});
export const goalActionSchema = z.discriminatedUnion("action", [
  goalDetailsSchema.extend({ action: z.literal("details") }),
  z.object({
    action: z.literal("status"),
    status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]),
  }),
  z.object({ action: z.literal("addMilestone"), title: milestoneTitle }),
  z.object({
    action: z.literal("milestone"),
    milestoneId: id,
    completed: z.boolean(),
  }),
  z.object({ action: z.literal("removeMilestone"), milestoneId: id }),
  z.object({ action: z.literal("linkTask"), taskId: id }),
  z.object({ action: z.literal("unlinkTask"), taskId: id }),
]);

export function milestoneProgress(milestones: { completedAt: unknown }[]) {
  const completed = milestones.filter((item) =>
    Boolean(item.completedAt),
  ).length;
  return {
    completed,
    total: milestones.length,
    percent: milestones.length
      ? Math.round((completed / milestones.length) * 100)
      : 0,
  };
}
