import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";

export const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const inviteClaimLifetimeMs = 10 * 60 * 1000;

export function createInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function initialsFor(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "PB"
  );
}

export async function reserveInvite(token: string, now = new Date()) {
  if (token.length < 32 || token.length > 200) return null;
  const prisma = getPrisma();
  const invite = await prisma.invite.findFirst({
    where: {
      tokenHash: hashInviteToken(token),
      expiresAt: { gt: now },
      revokedAt: null,
      usedAt: null,
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
    },
    select: { id: true, circleId: true },
  });
  if (!invite) return null;

  const claimNonce = randomBytes(24).toString("base64url");
  const claimExpiresAt = new Date(now.getTime() + inviteClaimLifetimeMs);
  const reserved = await prisma.invite.updateMany({
    where: {
      id: invite.id,
      expiresAt: { gt: now },
      revokedAt: null,
      usedAt: null,
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
    },
    data: { claimNonce, claimExpiresAt },
  });

  return reserved.count === 1
    ? { inviteId: invite.id, circleId: invite.circleId, claimNonce }
    : null;
}

export async function findReservedInvite(
  inviteId: string,
  claimNonce: string,
  now = new Date(),
) {
  return getPrisma().invite.findFirst({
    where: {
      id: inviteId,
      claimNonce,
      claimExpiresAt: { gt: now },
      expiresAt: { gt: now },
      revokedAt: null,
      usedAt: null,
    },
    select: { id: true, circleId: true, role: true },
  });
}

export async function redeemReservedInvite(
  inviteId: string,
  claimNonce: string,
  userId: string,
  now = new Date(),
) {
  const prisma = getPrisma();
  return prisma.$transaction(async (transaction) => {
    const invite = await transaction.invite.findFirst({
      where: {
        id: inviteId,
        claimNonce,
        claimExpiresAt: { gt: now },
        expiresAt: { gt: now },
        revokedAt: null,
        usedAt: null,
      },
      select: { circleId: true, role: true, label: true },
    });
    if (!invite) throw new Error("Invite claim expired before redemption.");

    const redeemed = await transaction.invite.updateMany({
      where: { id: inviteId, claimNonce, usedAt: null },
      data: {
        claimNonce: null,
        claimExpiresAt: null,
        usedAt: now,
        usedById: userId,
      },
    });
    if (redeemed.count !== 1) throw new Error("Invite was already redeemed.");

    // The invite label is the member's name everywhere in the app,
    // not whatever Discord says.
    const label = invite.label?.trim();
    if (label) {
      await transaction.user.update({
        where: { id: userId },
        data: { name: label.slice(0, 80), initials: initialsFor(label) },
      });
    }

    await transaction.membership.create({
      data: {
        userId,
        circleId: invite.circleId,
        role: invite.role,
      },
    });
  });
}
