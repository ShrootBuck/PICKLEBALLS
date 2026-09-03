import { z } from "zod";

export const commitmentInputSchema = z.object({
  title: z.string().trim().min(3).max(100),
  definitionOfDone: z.string().trim().min(5).max(500),
});

export const checkInSchema = z.object({
  signal: z.enum(["WORKING", "CLEAR", "AT_RISK"]),
  blocker: z.string().trim().max(500).optional(),
});

export const socialReplySchema = z.object({
  targetType: z.enum(["COMMITMENT", "CHECK_IN"]),
  targetId: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(500),
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

export const aiUnblockSchema = z.object({
  signal: z.enum(["WORKING", "CLEAR", "AT_RISK"]),
  blocker: z.string().trim().max(500).optional().default(""),
});
