import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { safeAppPath } from "@/lib/navigation";
import { shouldPushNotification } from "@/lib/notification-policy";
import {
  getNotificationPrefs,
  notifyProofReviewed,
  notifyProofSubmitted,
  notifyReplyReceived,
} from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export const notification = schemaTask({
  id: "notification",
  schema: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("proof-submitted"),
      proofId: z.string(),
      actorId: z.string(),
      circleId: z.string(),
    }),
    z.object({
      kind: z.literal("proof-reviewed"),
      reviewId: z.string(),
      reviewerId: z.string(),
      circleId: z.string(),
    }),
    z.object({
      kind: z.literal("reply-received"),
      replyId: z.string(),
      authorId: z.string(),
      circleId: z.string(),
    }),
    z.object({ kind: z.literal("push"), notificationId: z.string() }),
  ]),
  queue: { concurrencyLimit: 5 },
  run: async (payload) => {
    switch (payload.kind) {
      case "proof-submitted":
        return notifyProofSubmitted(payload);
      case "proof-reviewed":
        return notifyProofReviewed(payload);
      case "reply-received":
        return notifyReplyReceived(payload);
    }
    const { notificationId } = payload;
    const notification = await getPrisma().notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) return { skipped: true };
    const prefs = await getNotificationPrefs(notification.recipientId);
    if (!shouldPushNotification(notification.kind, prefs))
      return { skipped: true };
    const data = notification.data as Record<string, unknown> | null;
    return sendPushToUser(
      notification.recipientId,
      {
        title: notification.title,
        body: notification.body,
        url: safeAppPath(data?.url, "/"),
        tag: notification.id,
        notificationId: notification.id,
      },
      true,
    );
  },
});
