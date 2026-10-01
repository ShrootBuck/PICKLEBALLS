import "server-only";

import type { BucketItemStatus, Prisma } from "@/generated/prisma/client";
import { bucketTally, openBucketVoteStage } from "@/lib/bucket-list-policy";

type Transaction = Prisma.TransactionClient;

// Advances an open vote once every current member has said yes. The status
// guard keeps a retried or concurrent vote from advancing an item twice.
export async function settleBucketItem(
  tx: Transaction,
  item: {
    id: string;
    status: BucketItemStatus;
    completionRequestedAt: Date | null;
  },
  memberIds: string[],
  now: Date,
) {
  const stage = openBucketVoteStage(item);
  if (!stage) return null;
  const votes = await tx.bucketVote.findMany({
    where: { itemId: item.id, stage },
    select: { userId: true, inFavor: true },
  });
  if (!bucketTally(memberIds, votes).unanimous) return null;
  if (stage === "PROPOSAL") {
    const approved = await tx.bucketItem.updateMany({
      where: { id: item.id, status: "PROPOSED" },
      data: { status: "ACTIVE", approvedAt: now },
    });
    return approved.count ? ("APPROVED" as const) : null;
  }
  const completed = await tx.bucketItem.updateMany({
    where: {
      id: item.id,
      status: "ACTIVE",
      completionRequestedAt: { not: null },
    },
    data: { status: "COMPLETED", completedAt: now },
  });
  return completed.count ? ("COMPLETED" as const) : null;
}

// Removing a member can finish a vote that was only waiting on them.
export async function settleBucketItems(
  tx: Transaction,
  circleId: string,
  now = new Date(),
) {
  const [members, items] = await Promise.all([
    tx.membership.findMany({ where: { circleId }, select: { userId: true } }),
    tx.bucketItem.findMany({
      where: {
        circleId,
        OR: [
          { status: "PROPOSED" },
          { status: "ACTIVE", completionRequestedAt: { not: null } },
        ],
      },
      select: { id: true, status: true, completionRequestedAt: true },
    }),
  ]);
  const memberIds = members.map((member) => member.userId);
  for (const item of items) await settleBucketItem(tx, item, memberIds, now);
}
