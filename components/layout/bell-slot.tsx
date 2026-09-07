import {
  type InboxNotification,
  NotificationBell,
} from "@/components/layout/notification-bell";
import { inboxKinds, notificationPageSize } from "@/lib/notification-policy";
import { getPrisma } from "@/lib/prisma";

export async function BellSlot({
  circleId,
  userId,
}: {
  circleId: string;
  userId: string;
}) {
  const prisma = getPrisma();
  const [inbox, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: userId, circleId, kind: { in: inboxKinds } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: notificationPageSize + 1,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        entityId: true,
        data: true,
        readAt: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    prisma.notification.count({
      where: {
        recipientId: userId,
        circleId,
        readAt: null,
        kind: { in: inboxKinds },
      },
    }),
  ]);
  const inboxProps: InboxNotification[] = inbox
    .slice(0, notificationPageSize)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      body: item.body,
      entityId: item.entityId,
      data:
        item.data && typeof item.data === "object"
          ? (item.data as { url?: string })
          : null,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      actor: { name: item.actor.name },
    }));
  return (
    <NotificationBell
      circleId={circleId}
      initialInbox={inboxProps}
      initialUnreadCount={unreadCount}
      initialNextCursor={
        inbox.length > notificationPageSize
          ? (inboxProps.at(-1)?.id ?? null)
          : null
      }
    />
  );
}
