import "server-only";

import { getPrisma } from "@/lib/prisma";
import { socialReplySchema } from "@/lib/schemas";
import { DomainError } from "@/lib/tasks";

export async function createSocialReply(
  authorId: string,
  circleId: string,
  input: unknown,
) {
  const parsed = socialReplySchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("Write a reply between 1 and 500 characters.");
  }

  const { targetType, targetId, body } = parsed.data;

  return getPrisma().$transaction(async (transaction) => {
    if (targetType === "COMMITMENT") {
      const task = await transaction.commitment.findFirst({
        where: { id: targetId, circleId },
        select: { id: true, title: true, user: { select: { name: true } } },
      });
      if (!task) throw new DomainError("Task not found.", 404);

      const reply = await transaction.socialReply.create({
        data: {
          authorId,
          circleId,
          commitmentId: task.id,
          body,
        },
        include: {
          author: {
            select: { id: true, name: true, image: true, initials: true },
          },
        },
      });
      await transaction.activityEvent.create({
        data: {
          circleId,
          actorId: authorId,
          kind: "REPLY_POSTED",
          entityId: task.id,
          summary: `replied to ${task.user.name} on “${task.title}”`,
          metadata: { targetType, replyId: reply.id },
        },
      });
      return reply;
    }

    const checkIn = await transaction.checkIn.findFirst({
      where: { id: targetId, circleId },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!checkIn) throw new DomainError("Check-in not found.", 404);

    const reply = await transaction.socialReply.create({
      data: {
        authorId,
        circleId,
        checkInId: checkIn.id,
        body,
      },
      include: {
        author: {
          select: { id: true, name: true, image: true, initials: true },
        },
      },
    });
    await transaction.activityEvent.create({
      data: {
        circleId,
        actorId: authorId,
        kind: "REPLY_POSTED",
        entityId: checkIn.id,
        summary: `replied to ${checkIn.user.name}'s check-in`,
        metadata: { targetType, replyId: reply.id },
      },
    });
    return reply;
  });
}
