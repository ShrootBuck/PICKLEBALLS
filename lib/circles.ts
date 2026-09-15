import "server-only";

import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { proofApprovalProgress } from "@/lib/task-policy";
import { serializable } from "@/lib/transaction";

export { ACTIVE_CIRCLE_COOKIE, parseActiveCircleId } from "@/lib/circle-cookie";
export const MAX_CIRCLE_NAME_LENGTH = 40;

export function slugifyCircleName(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "circle";
}

async function uniqueSlug(base: string) {
  const prisma = getPrisma();
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.circle.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
    const suffix = randomBytes(3).toString("hex");
    slug = `${base.slice(0, 33)}-${suffix}`;
  }
  return `${base.slice(0, 24)}-${randomBytes(6).toString("hex")}`;
}

export async function createCircle(userId: string, rawName: string) {
  const name = rawName.trim().slice(0, MAX_CIRCLE_NAME_LENGTH);
  if (!name) throw new Error("Give your circle a name.");
  const prisma = getPrisma();
  const slug = await uniqueSlug(slugifyCircleName(name));
  return prisma.$transaction(async (transaction) => {
    const circle = await transaction.circle.create({
      data: { slug, name },
    });
    const membership = await transaction.membership.create({
      data: { userId, circleId: circle.id, role: "OWNER" },
      include: { circle: true, user: true },
    });
    return { circle, membership };
  });
}

export async function listMyCircles(userId: string) {
  return getPrisma().membership.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { circle: true },
  });
}

// Removing a reviewer must not strand proofs that all remaining peers approved.
export async function removeCircleMember(
  userId: string,
  circleId: string,
  actorId: string,
) {
  return serializable(async (tx) => {
    const deleted = await tx.membership.deleteMany({
      where: { userId, circleId, role: "MEMBER" },
    });
    if (!deleted.count) return deleted;
    const [members, proofs] = await Promise.all([
      tx.membership.findMany({ where: { circleId }, select: { userId: true } }),
      tx.taskProof.findMany({
        where: { circleId, reviewStatus: "PENDING", replacedById: null },
        select: {
          id: true,
          ownerId: true,
          commitmentId: true,
          reviews: {
            select: { reviewerId: true, decision: true },
          },
        },
      }),
    ]);
    for (const proof of proofs) {
      const progress = proofApprovalProgress(
        proof.ownerId,
        members.map((m) => m.userId),
        proof.reviews,
      );
      if (progress.approvalCount < progress.requiredApprovals) continue;
      await tx.taskProof.update({
        where: { id: proof.id },
        data: { reviewStatus: "APPROVED" },
      });
      await tx.commitment.update({
        where: { id: proof.commitmentId },
        data: { status: "VERIFIED" },
      });
      await tx.activityEvent.create({
        data: {
          circleId,
          actorId,
          kind: "PROOF_APPROVED",
          entityId: proof.id,
          summary:
            "verified proof after the circle changed; all remaining members approved",
        },
      });
    }
    return deleted;
  });
}
