import "server-only";
import { DomainError } from "@/lib/errors";
import { likeInclude, likeSummary } from "@/lib/like-summary";
import { getPrisma } from "@/lib/prisma";
import { socialAuthorSelect } from "@/lib/social-data";

// A challenge's reason is read alongside the proof's comments.
export async function getProofDiscussion(
  circleId: string,
  proofId: string,
  before?: string,
  viewerId = "",
) {
  const prisma = getPrisma();
  const where = { circleId, proofId };
  const cursor = before
    ? await prisma.socialReply.findFirst({
        where: { ...where, id: before },
        select: { id: true, createdAt: true },
      })
    : null;
  if (before && !cursor) throw new DomainError("Reply not found.", 404);
  const [rows, challenge] = await Promise.all([
    prisma.socialReply.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      include: {
        ...likeInclude(viewerId),
        author: { select: socialAuthorSelect },
      },
    }),
    prisma.proofChallenge.findFirst({
      where: { circleId, proofId },
      include: {
        ...likeInclude(viewerId),
        challenger: { select: socialAuthorSelect },
      },
    }),
  ]);
  return {
    replies: rows.slice(0, 50).map((reply) => ({
      ...reply,
      ...likeSummary(reply),
      createdAt: reply.createdAt.toISOString(),
      updatedAt: reply.updatedAt.toISOString(),
    })),
    hasMore: rows.length > 50,
    challenges: challenge
      ? [
          {
            ...likeSummary(challenge),
            id: challenge.id,
            body: challenge.reason,
            createdAt: challenge.createdAt.toISOString(),
            author: challenge.challenger,
            challenge: true as const,
          },
        ]
      : [],
  };
}
