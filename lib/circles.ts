import "server-only";

import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";

export const ACTIVE_CIRCLE_COOKIE = "pb_active_circle";
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

export function parseActiveCircleId(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key !== ACTIVE_CIRCLE_COOKIE) continue;
    const value = decodeURIComponent(part.slice(index + 1).trim());
    if (value) return value;
  }
  return null;
}
