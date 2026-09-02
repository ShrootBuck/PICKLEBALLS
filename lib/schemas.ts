import { z } from "zod";

export const commitmentInputSchema = z.object({
  title: z.string().trim().min(3).max(100),
  definitionOfDone: z.string().trim().min(5).max(500),
  revisionNote: z.string().trim().max(240).optional(),
});

export const checkInSchema = z.object({
  signal: z.enum(["WORKING", "CLEAR", "AT_RISK"]),
  blocker: z.string().trim().max(500).optional(),
});

export const proofReviewSchema = z
  .object({
    decision: z.enum(["APPROVED", "CHALLENGED"]),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === "CHALLENGED" && !value.note) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "A challenge needs a useful note.",
      });
    }
  });

export const taskRefinementInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  definitionOfDone: z.string().trim().max(500),
});

export const receiptConfirmationSchema = z.object({
  cadence: z.enum(["DAILY", "WEEKLY"]),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyAverageMinutes: z.coerce.number().int().min(0).max(10080).nullable(),
  totalScreenTimeMinutes: z.coerce.number().int().min(0).max(10080).nullable(),
  socialMinutes: z.coerce.number().int().min(0).max(10080).nullable(),
  pickups: z.coerce.number().int().min(0).max(100000).nullable(),
  comparisonPercent: z.coerce.number().min(-100).max(10000).nullable(),
  topApps: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        minutes: z.number().int().min(0).max(10080),
      }),
    )
    .max(12),
  summary: z.string().trim().max(500).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  warnings: z.array(z.string().max(200)).max(10),
  originalAIExtraction: z.unknown().nullable(),
  hasUserCorrections: z.boolean(),
});
