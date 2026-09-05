import { z } from "zod";
import { isPushEndpoint } from "@/lib/push-endpoint";

export const commitmentInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  definitionOfDone: z.string().trim().min(1).max(500),
});

export const checkInSchema = z.object({
  signal: z.enum(["YAY", "NAY"]),
  blocker: z.string().trim().max(500).optional(),
});

export const socialReplySchema = z.object({
  targetType: z.enum(["COMMITMENT", "CHECK_IN", "PROOF", "REVIEW"]),
  targetId: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(500),
});

export const replyEditSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1).max(2000).url().refine(isPushEndpoint),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
  }),
  userAgent: z.string().trim().max(500).optional(),
});

export const notificationPreferencesSchema = z.object({
  replies: z.boolean(),
  proofsSubmitted: z.boolean(),
  proofReviews: z.boolean(),
  taskMissed: z.boolean(),
  taskCreated: z.boolean(),
  checkIns: z.boolean(),
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

const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const timeblockPdfSchema = z.object({
  dueMonday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(100),
        title: z.string().trim().min(1).max(160),
        startedAt: localDateTimeSchema,
        completedAt: localDateTimeSchema,
      }),
    )
    .max(56),
});
