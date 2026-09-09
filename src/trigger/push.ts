import { task } from "@trigger.dev/sdk";
import { safeAppPath } from "@/lib/navigation";
import { shouldPushNotification } from "@/lib/notification-policy";
import { getNotificationPrefs } from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export const deliverPush = task({
  id: "deliver-push",
  queue: { concurrencyLimit: 5 },
  run: async ({ notificationId }: { notificationId: string }) => {
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
