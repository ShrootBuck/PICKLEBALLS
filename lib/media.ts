import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { mediaIdsSchema } from "@/lib/media-policy";

export async function claimMedia(
  transaction: Prisma.TransactionClient,
  ids: string[],
  ownerId: string,
  circleId: string,
) {
  if (!mediaIdsSchema.safeParse(ids).success)
    throw new DomainError("Choose up to six attachments.");
  if (!ids.length) return;
  const result = await transaction.mediaUpload.updateMany({
    where: { id: { in: ids }, ownerId, circleId, ready: true, claimed: false },
    data: { claimed: true },
  });
  if (result.count !== ids.length)
    throw new DomainError(
      "Attachments are unavailable or already posted. Choose them again.",
      409,
    );
}
