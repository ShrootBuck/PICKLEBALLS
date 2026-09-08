import { z } from "zod";
import { mediaIdsSchema } from "@/lib/media-policy";
import { isPushEndpoint } from "@/lib/push-endpoint";

export const commitmentInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  definitionOfDone: z.string().trim().min(1).max(500),
});

export const checkInSchema = z.object({
  signal: z.enum(["YAY", "NAY"]),
  blocker: z.string().trim().max(500).optional(),
});

export const socialReplySchema = z
  .object({
    targetType: z.enum([
      "COMMITMENT",
      "CHECK_IN",
      "CHECK_IN_UPDATE",
      "PROOF",
      "REVIEW",
    ]),
    targetId: z.string().trim().min(1).max(100),
    body: z.string().trim().max(500),
    mediaIds: mediaIdsSchema.default([]),
  })
  .refine(
    (v) => v.body.length > 0 || v.mediaIds.length > 0,
    "Write a reply or attach media.",
  );

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
  proofsSubmitted: z.boolean(),
  screenTime: z.boolean(),
});
export const proofReviewSchema = z.object({
  decision: z.enum(["APPROVED", "CHALLENGED"]),
  note: z.string().trim().min(1, "Every verdict needs a comment.").max(500),
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
