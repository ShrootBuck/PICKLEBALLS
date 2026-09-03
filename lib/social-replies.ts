import "server-only";

import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { replyEditSchema, socialReplySchema } from "@/lib/schemas";
import { canEditReply } from "@/lib/task-policy";

export { replyEditWindowMs } from "@/lib/task-policy";

const authorSelect = {
  id: true,
  name: true,
  image: true,
  initials: true,
} as const;

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
        include: { author: { select: authorSelect } },
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

    if (targetType === "CHECK_IN") {
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
        include: { author: { select: authorSelect } },
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
    }

    if (targetType === "PROOF") {
      const proof = await transaction.taskProof.findFirst({
        where: { id: targetId, circleId },
        select: {
          id: true,
          commitment: { select: { title: true } },
          owner: { select: { name: true } },
        },
      });
      if (!proof) throw new DomainError("Proof not found.", 404);

      const reply = await transaction.socialReply.create({
        data: {
          authorId,
          circleId,
          proofId: proof.id,
          body,
        },
        include: { author: { select: authorSelect } },
      });
      await transaction.activityEvent.create({
        data: {
          circleId,
          actorId: authorId,
          kind: "REPLY_POSTED",
          entityId: proof.id,
          summary: `replied to ${proof.owner.name}'s proof for “${proof.commitment.title}”`,
          metadata: { targetType, replyId: reply.id },
        },
      });
      return reply;
    }

    const review = await transaction.taskProofReview.findFirst({
      where: { id: targetId, circleId },
      select: {
        id: true,
        decision: true,
        reviewer: { select: { name: true } },
        proof: {
          select: { id: true, commitment: { select: { title: true } } },
        },
      },
    });
    if (!review) throw new DomainError("Review not found.", 404);

    const reply = await transaction.socialReply.create({
      data: {
        authorId,
        circleId,
        reviewId: review.id,
        body,
      },
      include: { author: { select: authorSelect } },
    });
    await transaction.activityEvent.create({
      data: {
        circleId,
        actorId: authorId,
        kind: "REPLY_POSTED",
        entityId: review.proof.id,
        summary: `replied to ${review.reviewer.name}'s ${review.decision === "CHALLENGED" ? "challenge" : "approval"} on “${review.proof.commitment.title}”`,
        metadata: { targetType, replyId: reply.id },
      },
    });
    return reply;
  });
}

export async function updateSocialReply(
  replyId: string,
  authorId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = replyEditSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("Write a reply between 1 and 500 characters.");
  }
  const reply = await getPrisma().socialReply.findFirst({
    where: { id: replyId, circleId },
  });
  if (!reply) throw new DomainError("Reply not found.", 404);
  if (reply.authorId !== authorId) {
    throw new DomainError("You can only edit your own replies.", 403);
  }
  if (!canEditReply(reply.createdAt, now)) {
    throw new DomainError(
      "Edit window closed. 10 minutes, then it is set in stone.",
      409,
    );
  }
  return getPrisma().socialReply.update({
    where: { id: reply.id },
    data: { body: parsed.data.body },
    include: { author: { select: authorSelect } },
  });
}

export async function deleteSocialReply(
  replyId: string,
  authorId: string,
  circleId: string,
  now = new Date(),
) {
  const reply = await getPrisma().socialReply.findFirst({
    where: { id: replyId, circleId },
  });
  if (!reply) throw new DomainError("Reply not found.", 404);
  if (reply.authorId !== authorId) {
    throw new DomainError("You can only delete your own replies.", 403);
  }
  if (!canEditReply(reply.createdAt, now)) {
    throw new DomainError(
      "Delete window closed. 10 minutes, then it is set in stone.",
      409,
    );
  }
  await getPrisma().socialReply.delete({ where: { id: reply.id } });
  return { id: reply.id };
}
