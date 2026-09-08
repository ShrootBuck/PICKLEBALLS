import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { serializable } from "@/lib/transaction";

export const postLikeSchema = z
  .object({
    targetType: z.enum(["PROOF", "CHECK_IN_UPDATE"]),
    targetId: z.string().min(1).max(100),
    liked: z.boolean(),
  })
  .strict();

export async function setPostLike(
  userId: string,
  circleId: string,
  input: z.infer<typeof postLikeSchema>,
) {
  return serializable(async (tx) => {
    const membership = await tx.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
    });
    if (!membership) throw new DomainError("Member not found.", 404);
    const isProof = input.targetType === "PROOF";
    const target = isProof
      ? await tx.taskProof.findFirst({
          where: { id: input.targetId, circleId },
          select: { id: true },
        })
      : await tx.checkInUpdate.findFirst({
          where: { id: input.targetId, circleId },
          select: { id: true },
        });
    if (!target) throw new DomainError("Post not found.", 404);
    const where = isProof
      ? { proofId: target.id }
      : { checkInUpdateId: target.id };
    if (input.liked) {
      await tx.postLike.createMany({
        data: [{ userId, circleId, ...where }],
        skipDuplicates: true,
      });
    } else {
      await tx.postLike.deleteMany({ where: { userId, circleId, ...where } });
    }
    const likeCount = await tx.postLike.count({
      where: { circleId, ...where },
    });
    return { likeCount, likedByMe: input.liked };
  });
}
