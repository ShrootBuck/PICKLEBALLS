import "server-only";

import type { BucketItemStatus, Prisma } from "@/generated/prisma/client";
import {
  type BucketVoteStage,
  openBucketVoteStage,
} from "@/lib/bucket-list-policy";
import { settleBucketItem as settle } from "@/lib/bucket-list-settle";
import { DomainError } from "@/lib/errors";
import { notifyBucketItem, withNotifications } from "@/lib/notifications";
import { bucketItemInputSchema, bucketVoteSchema } from "@/lib/schemas";
import { serializable } from "@/lib/transaction";

type Transaction = Prisma.TransactionClient;

async function findItem(tx: Transaction, itemId: string, circleId: string) {
  const item = await tx.bucketItem.findFirst({
    where: { id: itemId, circleId },
  });
  if (!item) throw new DomainError("Bucket list item not found.", 404);
  return item;
}

async function circleMembers(
  tx: Transaction,
  circleId: string,
  userId: string,
) {
  const members = await tx.membership.findMany({
    where: { circleId },
    select: { userId: true, role: true },
  });
  const viewer = members.find((member) => member.userId === userId);
  if (!viewer) throw new DomainError("You are no longer in this circle.", 403);
  return { ids: members.map((member) => member.userId), role: viewer.role };
}

export async function proposeBucketItem(
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = bucketItemInputSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(
      "Give your idea a title up to 100 characters. Keep details under 500.",
    );
  if (parsed.data.circleId !== circleId)
    throw new DomainError(
      "Your active circle changed. Refresh and try again.",
      409,
    );
  return withNotifications(async (tx, notifications) => {
    const members = await circleMembers(tx, circleId, userId);
    const item = await tx.bucketItem.create({
      data: {
        circleId,
        proposerId: userId,
        title: parsed.data.title,
        details: parsed.data.details || null,
        createdAt: now,
        votes: {
          create: { userId, stage: "PROPOSAL", inFavor: true, createdAt: now },
        },
      },
    });
    // A solo circle is unanimous as soon as the idea is proposed.
    const outcome = await settle(tx, item, members.ids, now);
    if (!outcome)
      await notifyBucketItem(
        { itemId: item.id, actorId: userId, circleId, event: "PROPOSED" },
        notifications,
      );
    return {
      id: item.id,
      status: outcome ? ("ACTIVE" as const) : ("PROPOSED" as const),
    };
  });
}

function staleVoteMessage(status: BucketItemStatus, stage: BucketVoteStage) {
  if (status === "WITHDRAWN") return "This idea was withdrawn.";
  if (status === "COMPLETED") return "This is already checked off.";
  if (stage === "PROPOSAL") return "This idea already made the list.";
  if (status === "PROPOSED") return "This idea is still up for a vote.";
  return "That check-off request was cancelled.";
}

export async function voteOnBucketItem(
  itemId: string,
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = bucketVoteSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("Choose a vote.");
  const { stage, inFavor } = parsed.data;
  return withNotifications(async (tx, notifications) => {
    const item = await findItem(tx, itemId, circleId);
    const members = await circleMembers(tx, circleId, userId);
    if (openBucketVoteStage(item) !== stage) {
      // A yes that lands after everyone agreed already got what it asked for.
      const settled =
        stage === "PROPOSAL"
          ? item.status === "ACTIVE" || item.status === "COMPLETED"
          : item.status === "COMPLETED";
      if (inFavor && settled) return { status: item.status };
      throw new DomainError(staleVoteMessage(item.status, stage), 409);
    }
    if (stage === "PROPOSAL" && item.proposerId === userId)
      throw new DomainError(
        "You proposed this idea, so you’re already in. Withdraw it instead.",
        409,
      );
    if (stage === "COMPLETION" && item.completionRequestedById === userId)
      throw new DomainError(
        "You asked to check this off, so you’ve already confirmed. Cancel the request instead.",
        409,
      );
    await tx.bucketVote.upsert({
      where: { itemId_stage_userId: { itemId, stage, userId } },
      create: { itemId, stage, userId, inFavor, createdAt: now },
      update: { inFavor },
    });
    const outcome = await settle(tx, item, members.ids, now);
    if (outcome)
      await notifyBucketItem(
        { itemId, actorId: userId, circleId, event: outcome },
        notifications,
      );
    return {
      status:
        outcome === "APPROVED"
          ? ("ACTIVE" as const)
          : outcome === "COMPLETED"
            ? ("COMPLETED" as const)
            : item.status,
    };
  });
}

export async function requestBucketItemCompletion(
  itemId: string,
  userId: string,
  circleId: string,
  now = new Date(),
) {
  return withNotifications(async (tx, notifications) => {
    const item = await findItem(tx, itemId, circleId);
    const members = await circleMembers(tx, circleId, userId);
    if (item.status === "WITHDRAWN")
      throw new DomainError("This idea was withdrawn.", 409);
    if (item.status === "PROPOSED")
      throw new DomainError(
        "Everyone has to be in before it can be checked off.",
        409,
      );
    if (item.status === "COMPLETED")
      throw new DomainError("This is already checked off.", 409);
    if (item.completionRequestedAt) {
      if (item.completionRequestedById === userId)
        return { status: item.status };
      throw new DomainError(
        "Someone already asked to check this off. Confirm it instead.",
        409,
      );
    }
    await tx.bucketVote.deleteMany({ where: { itemId, stage: "COMPLETION" } });
    const requested = await tx.bucketItem.update({
      where: { id: itemId },
      data: {
        completionRequestedById: userId,
        completionRequestedAt: now,
        votes: {
          create: {
            userId,
            stage: "COMPLETION",
            inFavor: true,
            createdAt: now,
          },
        },
      },
    });
    const outcome = await settle(tx, requested, members.ids, now);
    await notifyBucketItem(
      {
        itemId,
        actorId: userId,
        circleId,
        event: outcome ? "COMPLETED" : "COMPLETION_REQUESTED",
      },
      notifications,
    );
    return {
      status: outcome ? ("COMPLETED" as const) : ("ACTIVE" as const),
    };
  });
}

export async function cancelBucketItemCompletion(
  itemId: string,
  userId: string,
  circleId: string,
) {
  return serializable(async (tx) => {
    const item = await findItem(tx, itemId, circleId);
    const members = await circleMembers(tx, circleId, userId);
    if (item.status !== "ACTIVE")
      throw new DomainError(
        item.status === "COMPLETED"
          ? "This is already checked off."
          : "There’s no check-off request to cancel.",
        409,
      );
    if (!item.completionRequestedAt) return { status: item.status };
    if (item.completionRequestedById !== userId && members.role !== "OWNER")
      throw new DomainError(
        "Only the person who asked, or the circle owner, can cancel this.",
        403,
      );
    await tx.bucketVote.deleteMany({ where: { itemId, stage: "COMPLETION" } });
    await tx.bucketItem.update({
      where: { id: itemId },
      data: { completionRequestedById: null, completionRequestedAt: null },
    });
    return { status: "ACTIVE" as const };
  });
}

export async function withdrawBucketItem(
  itemId: string,
  userId: string,
  circleId: string,
  now = new Date(),
) {
  return serializable(async (tx) => {
    const item = await findItem(tx, itemId, circleId);
    const members = await circleMembers(tx, circleId, userId);
    if (item.proposerId !== userId && members.role !== "OWNER")
      throw new DomainError(
        "Only the person who proposed it, or the circle owner, can withdraw this idea.",
        403,
      );
    if (item.status === "WITHDRAWN") return { status: item.status };
    if (item.status !== "PROPOSED")
      throw new DomainError(
        "Only ideas that are still up for a vote can be withdrawn.",
        409,
      );
    await tx.bucketItem.update({
      where: { id: itemId },
      data: { status: "WITHDRAWN", withdrawnAt: now },
    });
    return { status: "WITHDRAWN" as const };
  });
}
