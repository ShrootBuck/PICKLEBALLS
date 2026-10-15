import "server-only";

import { randomBytes } from "node:crypto";
import {
  circleNameError,
  circleNameSchema,
  MAX_CIRCLE_NAME_LENGTH,
} from "@/lib/circle-name";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { serializable } from "@/lib/transaction";
import { closeWorkSessions } from "@/lib/work-sessions";

export { ACTIVE_CIRCLE_COOKIE, parseActiveCircleId } from "@/lib/circle-cookie";
export { MAX_CIRCLE_NAME_LENGTH } from "@/lib/circle-name";

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

export async function renameCircle(
  userId: string,
  circleId: string,
  rawName: string,
) {
  const parsed = circleNameSchema.safeParse(rawName);
  if (!parsed.success) throw new DomainError(circleNameError);
  return serializable(async (tx) => {
    const member = await tx.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
    });
    if (!member) throw new DomainError("Circle not found.", 404);
    if (member.role !== "OWNER")
      throw new DomainError("Only the circle owner can change its name.", 403);
    return tx.circle.update({
      where: { id: circleId },
      data: { name: parsed.data },
      select: { id: true, name: true, slug: true },
    });
  });
}

// Membership changes never settle votes or change existing proof requirements.
export async function removeCircleMember(
  userId: string,
  circleId: string,
  actorId: string,
) {
  return serializable(async (tx) => {
    const actor = await tx.membership.findUnique({
      where: { userId_circleId: { userId: actorId, circleId } },
    });
    if (actor?.role !== "OWNER")
      throw new DomainError("Only the circle owner can remove members.", 403);
    const result = await tx.membership.deleteMany({
      where: { userId, circleId, role: "MEMBER" },
    });
    if (result.count) await closeWorkSessions(tx, { userId, circleId });
    if (result.count)
      await tx.notification.deleteMany({
        where: { circleId, recipientId: userId },
      });
    return result;
  });
}
