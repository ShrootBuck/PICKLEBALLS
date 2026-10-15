import "server-only";
import { getNotificationPrefs } from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

const maxAge = 24 * 60 * 60 * 1000;

export async function deliverMessagePush(id: string) {
  const prisma = getPrisma();
  const now = new Date();
  // A lease also protects direct local dispatch and recovery from racing.
  const claim = await prisma.messagePushDelivery.updateMany({
    where: { id, completedAt: null, nextAttemptAt: { lte: now } },
    data: {
      attempts: { increment: 1 },
      nextAttemptAt: new Date(now.getTime() + 2 * 60_000),
    },
  });
  if (!claim.count) return { skipped: true };
  try {
    const delivery = await prisma.messagePushDelivery.findUnique({
      where: { id },
      include: {
        message: {
          include: {
            sender: { select: { name: true } },
            conversation: { include: { circle: { select: { name: true } } } },
          },
        },
      },
    });
    if (!delivery) return { skipped: true };
    const { message, recipientId } = delivery;
    const { conversation } = message;
    const finish = async () => {
      await prisma.messagePushDelivery.updateMany({
        where: { id },
        data: { completedAt: new Date() },
      });
    };
    const prefs = await getNotificationPrefs(recipientId);
    let eligible = Boolean(
      message.sender &&
        message.senderId !== recipientId &&
        !message.deletedAt &&
        message.createdAt.getTime() > now.getTime() - maxAge,
    );
    if (conversation.circleId) {
      const member = await prisma.membership.findUnique({
        where: {
          userId_circleId: {
            userId: recipientId,
            circleId: conversation.circleId,
          },
        },
      });
      eligible &&= Boolean(
        prefs.groupMessages &&
          member &&
          member.createdAt <= message.createdAt &&
          member.groupReadThrough < message.sequence,
      );
    } else {
      eligible &&= Boolean(
        prefs.directMessages &&
          !message.readAt &&
          message.recipientId === recipientId &&
          (conversation.userAId === recipientId ||
            conversation.userBId === recipientId),
      );
    }
    if (!eligible) {
      await finish();
      return { skipped: true };
    }
    const preview =
      message.body.trim().replaceAll(/\s+/g, " ") ||
      (message.mediaIds.length === 1
        ? message.mediaIds[0].startsWith("v_")
          ? "Sent a video"
          : "Sent a photo"
        : "Sent attachments");
    const url = new URL("/messages", "https://app.invalid");
    url.searchParams.set("chat", conversation.id);
    if (conversation.circleId)
      url.searchParams.set("circle", conversation.circleId);
    const result = await sendPushToUser(
      recipientId,
      {
        title: conversation.circle
          ? `${message.sender?.name} in ${conversation.circle.name}`.slice(
              0,
              120,
            )
          : (message.sender?.name ?? "New message").slice(0, 120),
        body: preview.length > 140 ? `${preview.slice(0, 139)}…` : preview,
        url: `${url.pathname}${url.search}`,
        // Retries replace this message's alert instead of adding duplicates.
        tag: `message:${message.id}`,
      },
      true,
    );
    await finish();
    return result;
  } catch (error) {
    const delivery = await prisma.messagePushDelivery.findUnique({
      where: { id },
    });
    if (delivery) {
      await prisma.messagePushDelivery.updateMany({
        where: { id, completedAt: null },
        data: {
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(
                60 * 60_000,
                30_000 * 2 ** Math.min(delivery.attempts - 1, 7),
              ),
          ),
        },
      });
    }
    throw error;
  }
}
