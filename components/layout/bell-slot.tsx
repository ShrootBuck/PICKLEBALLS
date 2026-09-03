import { NotificationBell } from "@/components/layout/notification-bell";
import { getPrisma } from "@/lib/prisma";

export async function BellSlot({ circleId }: { circleId: string }) {
  const events = await getPrisma().activityEvent.findMany({
    where: { circleId },
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
  });
  return (
    <NotificationBell
      events={events.map((event) => ({
        id: event.id,
        kind: event.kind,
        summary: event.summary,
        actorName: event.actor.name,
        entityId: event.entityId,
        createdAt: event.createdAt.toISOString(),
      }))}
    />
  );
}
