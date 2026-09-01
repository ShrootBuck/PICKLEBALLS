import { z } from "zod";

export const screenTimeExtractionSchema = z.object({
  reportDate: z
    .string()
    .nullable()
    .describe(
      "The date shown in the screenshot as YYYY-MM-DD, or null if it is not visible.",
    ),
  view: z
    .enum(["day", "week", "unknown"])
    .describe(
      "Whether the screenshot shows Apple's Day view, Week view, or neither clearly.",
    ),
  dailyAverageMinutes: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("The displayed daily average converted to minutes."),
  totalScreenTimeMinutes: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("The displayed total screen time converted to minutes."),
  socialMinutes: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("The displayed Social category time converted to minutes."),
  pickups: z.number().int().nonnegative().nullable(),
  comparisonPercent: z
    .number()
    .nullable()
    .describe(
      "Signed percent change from the comparison period. Negative means lower.",
    ),
  topApps: z.array(
    z.object({
      name: z.string(),
      minutes: z.number().int().nonnegative(),
    }),
  ),
  summary: z
    .string()
    .describe(
      "One blunt but non-shaming sentence about the clearest pattern in the screenshot.",
    ),
  confidence: z.number().min(0).max(1),
  warnings: z
    .array(z.string())
    .describe(
      "Ambiguities, cropped values, or reasons a person should manually review the result.",
    ),
});

export type ScreenTimeExtraction = z.infer<typeof screenTimeExtractionSchema>;
