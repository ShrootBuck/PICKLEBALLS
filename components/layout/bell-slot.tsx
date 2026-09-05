import {
  type InboxNotification,
  NotificationBell,
} from "@/components/layout/notification-bell";
import { getPrisma } from "@/lib/prisma";

export async function BellSlot({
  circleId,
  userId,
}: {
  circleId: string;
  userId: string;
}) {
  const prisma = getPrisma();
  const [events, inbox, unreadCount] = await Promise.all([
    prisma.activityEvent.findMany({
      where: {
        circleId,
        kind: { notIn: ["INVITE_CREATED", "INVITE_REVOKED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        kind: true,
        summary: true,
        entityId: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    prisma.notification.findMany({
      where: { recipientId: userId, circleId },
      orderBy: { createdAt: "desc" },
      take: 20,
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
      where: { recipientId: userId, circleId, readAt: null },
    }),
  ]);
  const inboxProps: InboxNotification[] = inbox.map((item) => ({
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
      events={events.map((event) => ({
        id: event.id,
        kind: event.kind,
        summary: event.summary,
        actorName: event.actor.name,
        entityId: event.entityId,
        createdAt: event.createdAt.toISOString(),
      }))}
      initialInbox={inboxProps}
      initialUnreadCount={unreadCount}
    />
  );
}
