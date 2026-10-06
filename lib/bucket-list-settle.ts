import "server-only";
import type { BucketItem, Prisma } from "@/generated/prisma/client";
import { bucketPlanReady, bucketTally } from "@/lib/bucket-list-policy";

export async function settleBucketItem(
  tx: Prisma.TransactionClient,
  item: BucketItem,
  _memberIds: string[],
  now: Date,
) {
  if (item.status === "WITHDRAWN" || item.status === "COMPLETED") return null;
  if (item.completionRequestedAt) {
    const votes = await tx.bucketVote.findMany({
      where: { itemId: item.id, stage: "COMPLETION" },
    });
    if (!bucketTally(item.completionParticipantIds, votes).unanimous)
      return null;
    await tx.bucketItem.update({
      where: { id: item.id },
      data: { status: "COMPLETED", completedAt: now },
    });
    return "COMPLETED" as const;
  }
  if (!item.scheduledFor) return null;
  const going = await tx.bucketVote.findMany({
    where: { itemId: item.id, stage: "RSVP", inFavor: true },
  });
  const ready = bucketPlanReady(
    item,
    going.map((v) => v.userId),
  );
  await tx.bucketItem.update({
    where: { id: item.id },
    data: {
      status: ready ? "ACTIVE" : "PROPOSED",
      approvedAt: ready ? (item.approvedAt ?? now) : null,
    },
  });
  return ready && item.status !== "ACTIVE" ? ("APPROVED" as const) : null;
}
