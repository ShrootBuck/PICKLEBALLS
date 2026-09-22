import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { safeAppPath } from "@/lib/navigation";
import { shouldPushNotification } from "@/lib/notification-policy";
import { getNotificationPrefs } from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export const notification = schemaTask({
  id: "notification",
  schema: z.object({ kind: z.literal("push"), notificationId: z.string() }),
  queue: { concurrencyLimit: 5 },
  run: async (payload) => {
    const { notificationId } = payload;
    const notification = await getPrisma().notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.readAt) return { skipped: true };
    const membership = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: {
          userId: notification.recipientId,
          circleId: notification.circleId,
        },
      },
      select: { userId: true },
    });
    if (!membership) return { skipped: true };
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
