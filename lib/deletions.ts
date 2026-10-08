import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  deleteMediaRows,
  queueObjectDeletion,
  queueReplyMedia,
} from "@/lib/deletion-storage";
import { DomainError } from "@/lib/errors";
import { serializable } from "@/lib/transaction";

export async function deletionMembership(
  tx: Prisma.TransactionClient,
  userId: string,
  circleId: string,
) {
  const member = await tx.membership.findUnique({
    where: { userId_circleId: { userId, circleId } },
  });
  if (!member) throw new DomainError("You are no longer in this circle.", 403);
  return member;
}

async function proofFiles(
  tx: Prisma.TransactionClient,
  where: Prisma.TaskProofWhereInput,
) {
  const proofs = await tx.taskProof.findMany({
    where,
    include: { image: { select: { objectKey: true } } },
  });
  const ids = proofs.map((p) => p.id);
  await tx.activityEvent.deleteMany({ where: { entityId: { in: ids } } });
  await tx.notification.deleteMany({ where: { entityId: { in: ids } } });
  await deleteMediaRows(tx, { id: { in: proofs.flatMap((p) => p.mediaIds) } });
  await queueReplyMedia(tx, {
    OR: [{ proofId: { in: ids } }, { review: { proofId: { in: ids } } }],
  });
  for (const proof of proofs)
    if (proof.image?.objectKey)
      await queueObjectDeletion(tx, proof.image.objectKey);
}

export type DeletableContent =
  | "goal"
  | "reply"
  | "proof"
  | "check-in"
  | "screen-time"
  | "bucket-item"
  | "task";
export async function deleteContent(
  kind: DeletableContent,
  id: string,
  userId: string,
  circleId: string,
) {
  return serializable(
    async (tx) => {
      const member = await deletionMembership(tx, userId, circleId);
      const own = { id, userId, circleId };
      if (kind === "goal") {
        const result = await tx.goal.deleteMany({ where: own });
        if (!result.count) throw new DomainError("Goal not found.", 404);
      } else if (kind === "reply") {
        const reply = await tx.socialReply.findFirst({
          where: { id, authorId: userId, circleId },
        });
        if (!reply) throw new DomainError("Reply not found.", 404);
        await deleteMediaRows(tx, { id: { in: reply.mediaIds } });
        await tx.socialReply.delete({ where: { id } });
      } else if (kind === "proof") {
        const proof = await tx.taskProof.findFirst({
          where: { id, ownerId: userId, circleId },
          include: { commitment: true },
        });
        if (!proof) throw new DomainError("Proof not found.", 404);
        // Keep the result and timing of a verified commitment. Unreviewed evidence
        // cannot earn new approvals after it has been removed.
        await proofFiles(tx, { commitmentId: proof.commitmentId });
        const pending = await tx.pendingProof.findMany({
          where: { commitmentId: proof.commitmentId },
        });
        await deleteMediaRows(tx, {
          id: { in: pending.flatMap((p) => p.mediaIds) },
        });
        await tx.pendingProof.deleteMany({
          where: { commitmentId: proof.commitmentId },
        });
        await tx.taskProof.deleteMany({
          where: { commitmentId: proof.commitmentId },
        });
        if (proof.commitment.status === "AWAITING_REVIEW") {
          await tx.commitment.update({
            where: { id: proof.commitmentId },
            data: { status: "OPEN" },
          });
        }
      } else if (kind === "task") {
        const task = await tx.commitment.findFirst({ where: own });
        if (!task) throw new DomainError("Task not found.", 404);
        if (task.status === "VERIFIED" || task.status === "MISSED")
          throw new DomainError(
            "Completed and missed results stay in your history. You can still remove their proof.",
            409,
          );
        if (
          !task.proofSubmittedAt &&
          task.dueAt <= new Date() &&
          task.status !== "CANCELLED"
        )
          throw new DomainError(
            "The deadline passed. A missed commitment cannot be cancelled.",
            409,
          );
        await proofFiles(tx, { commitmentId: id });
        const pending = await tx.pendingProof.findMany({
          where: { commitmentId: id },
        });
        await deleteMediaRows(tx, {
          id: { in: pending.flatMap((p) => p.mediaIds) },
        });
        await tx.pendingProof.deleteMany({ where: { commitmentId: id } });
        await tx.taskProof.deleteMany({ where: { commitmentId: id } });
        await tx.commitment.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
      } else if (kind === "check-in") {
        const update = await tx.checkInUpdate.findFirst({ where: own });
        if (!update) throw new DomainError("Check-in not found.", 404);
        await deleteMediaRows(tx, { id: { in: update.mediaIds } });
        await queueReplyMedia(tx, { checkInUpdateId: id });
        await tx.checkInUpdate.delete({ where: { id } });
        const latest = await tx.checkInUpdate.findFirst({
          where: { checkInId: update.checkInId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (latest)
          await tx.checkIn.update({
            where: { id: update.checkInId },
            data: { signal: latest.signal, blocker: latest.blocker },
          });
        else {
          await queueReplyMedia(tx, { checkInId: update.checkInId });
          await tx.checkIn.delete({ where: { id: update.checkInId } });
        }
      } else if (kind === "screen-time") {
        const submission = await tx.screenTimeSubmission.findFirst({
          where: own,
          include: { reading: true },
        });
        if (!submission) throw new DomainError("Screen time not found.", 404);
        await queueReplyMedia(tx, { screenTimeSubmissionId: id });
        const readings = await tx.screenTimeReading.findMany({
          where: { userId, circleId, weekStart: submission.weekStart },
        });
        await deleteMediaRows(tx, {
          id: { in: readings.map((r) => r.mediaId) },
        });
        await tx.screenTimeReading.deleteMany({
          where: { id: { in: readings.map((r) => r.id) } },
        });
      } else {
        const item = await tx.bucketItem.findFirst({ where: { id, circleId } });
        if (!item || (member.role !== "OWNER" && item.proposerId !== userId))
          throw new DomainError("Idea not found.", 404);
        await queueReplyMedia(tx, { bucketItemId: id });
        await tx.bucketItem.delete({ where: { id } });
      }
      // Activity summaries and notifications may contain the removed text.
      await tx.activityEvent.deleteMany({ where: { circleId, entityId: id } });
      await tx.notification.deleteMany({ where: { circleId, entityId: id } });
      return { id };
    },
    { timeout: 60_000 },
  );
}

async function circleFiles(tx: Prisma.TransactionClient, circleId: string) {
  await proofFiles(tx, { circleId });
  await deleteMediaRows(tx, { circleId });
  await tx.pendingProof.deleteMany({ where: { circleId } });
}

export async function changeCircleLifecycle(
  userId: string,
  circleId: string,
  action: "leave" | "transfer" | "delete",
  confirmation?: string,
  successorId?: string,
) {
  return serializable(
    async (tx) => {
      const member = await deletionMembership(tx, userId, circleId);
      const circle = await tx.circle.findUniqueOrThrow({
        where: { id: circleId },
      });
      if (action === "leave") {
        if (member.role === "OWNER")
          throw new DomainError(
            "Transfer ownership or delete the circle before leaving.",
            409,
          );
        await tx.membership.delete({
          where: { userId_circleId: { userId, circleId } },
        });
        await tx.notification.deleteMany({
          where: { recipientId: userId, circleId },
        });
      } else {
        if (member.role !== "OWNER")
          throw new DomainError("Only the circle owner can do this.", 403);
        if (action === "transfer") {
          if (!successorId || successorId === userId)
            throw new DomainError("Choose another current member.");
          await deletionMembership(tx, successorId, circleId);
          await tx.membership.update({
            where: { userId_circleId: { userId: successorId, circleId } },
            data: { role: "OWNER" },
          });
          await tx.membership.update({
            where: { userId_circleId: { userId, circleId } },
            data: { role: "MEMBER" },
          });
          // Previously issued owner invites must not restore the former owner.
          await tx.invite.updateMany({
            where: { circleId, role: "OWNER", usedAt: null },
            data: { revokedAt: new Date() },
          });
        } else {
          if (confirmation !== circle.name)
            throw new DomainError("Type the circle name to confirm deletion.");
          await circleFiles(tx, circleId);
          await tx.circle.delete({ where: { id: circleId } });
        }
      }
      return { id: circleId };
    },
    { timeout: 60_000 },
  );
}

export async function deleteOwnAccount(
  userId: string,
  sessionId: string,
  confirmation: string,
  now = new Date(),
) {
  if (confirmation !== "DELETE")
    throw new DomainError("Type DELETE to confirm account deletion.");
  return serializable(
    async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: sessionId, userId, expiresAt: { gt: now } },
      });
      if (!session) throw new DomainError("Sign in first.", 401);
      if (now.getTime() - session.createdAt.getTime() >= 10 * 60_000)
        throw new DomainError(
          "Sign in again with Discord, then return here to delete your account.",
          403,
        );
      const owned = await tx.membership.findMany({
        where: { userId, role: "OWNER" },
        include: { circle: true },
      });
      if (owned.length)
        throw new DomainError(
          `Transfer ownership or delete these circles first: ${owned.map((m) => m.circle.name).join(", ")}.`,
          409,
        );
      // The database retains anonymous shared attribution through nullable FKs.
      // Decisions stay counted, but personal review text is erased.
      await tx.taskProofReview.updateMany({
        where: { reviewerId: userId },
        data: { note: null },
      });
      await proofFiles(tx, { ownerId: userId });
      // Include other people's attachments on posts that cascade with this account.
      await queueReplyMedia(tx, {
        OR: [
          { authorId: userId },
          { commitment: { userId } },
          { checkIn: { userId } },
          { checkInUpdate: { userId } },
          { streakEvent: { userId } },
          { screenTimeSubmission: { userId } },
        ],
      });
      await deleteMediaRows(tx, { ownerId: userId });
      await tx.pendingProof.deleteMany({ where: { ownerId: userId } });
      const files = await tx.timeblockChatAttachment.findMany({
        where: { chat: { userId } },
      });
      for (const file of files) await queueObjectDeletion(tx, file.objectKey);
      const chat = await tx.timeblockChat.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (chat)
        await queueObjectDeletion(tx, `timeblock-chat/${chat.id}/`, true);
      await tx.invite.updateMany({
        where: { usedById: userId },
        data: { label: null },
      });
      await tx.rateLimit.deleteMany({
        where: { key: { startsWith: "app:", endsWith: `:${userId}` } },
      });
      await tx.user.delete({ where: { id: userId } });
      return { deleted: true };
    },
    { timeout: 60_000 },
  );
}
