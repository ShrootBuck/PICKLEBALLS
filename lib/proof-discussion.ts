import "server-only";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { socialAuthorSelect } from "@/lib/social-data";

// Keep reviews as reviews, but read their conversations alongside post comments.
export async function getProofDiscussion(
  circleId: string,
  proofId: string,
  before?: string,
) {
  const prisma = getPrisma();
  const where = { circleId, OR: [{ proofId }, { review: { proofId } }] };
  const cursor = before
    ? await prisma.socialReply.findFirst({
        where: { ...where, id: before },
        select: { id: true, createdAt: true },
      })
    : null;
  if (before && !cursor) throw new DomainError("Reply not found.", 404);
  const [rows, reviews] = await Promise.all([
    prisma.socialReply.findMany({
      where: {
        AND: [
          where,
          ...(cursor
            ? [
                {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      include: {
        author: { select: socialAuthorSelect },
        review: { select: { reviewer: { select: { name: true } } } },
      },
    }),
    prisma.taskProofReview.findMany({
      where: { circleId, proofId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { reviewer: { select: socialAuthorSelect } },
    }),
  ]);
  return {
    replies: rows.slice(0, 50).map(({ review, ...reply }) => ({
      ...reply,
      createdAt: reply.createdAt.toISOString(),
      updatedAt: reply.updatedAt.toISOString(),
      replyContext: review
        ? `Reply to ${review.reviewer.name}’s verdict`
        : undefined,
    })),
    hasMore: rows.length > 50,
    verdicts: reviews.map((review) => ({
      id: review.id,
      body: review.note ?? "",
      createdAt: review.createdAt.toISOString(),
      author: review.reviewer,
      verdict: review.decision,
    })),
  };
}
