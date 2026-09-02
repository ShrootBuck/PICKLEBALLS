import "server-only";

import { getPrisma } from "@/lib/prisma";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export const rollingWindowDays = 30;

export function getRollingWindow(now = new Date()) {
  const today = requireDateKey(phoenixDateKey(now));
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - (rollingWindowDays - 1));
  return { days: rollingWindowDays, cutoff };
}

export async function pruneExpiredAppData(now = new Date()) {
  const { cutoff, days } = getRollingWindow(now);
  const prisma = getPrisma();
  const [
    revisions,
    proofs,
    commitments,
    checkIns,
    receipts,
    activities,
    aiRuns,
    digests,
    invites,
    verifications,
    sessions,
    rateLimits,
  ] = await prisma.$transaction([
    prisma.commitmentRevision.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        commitment: { day: { gte: cutoff } },
      },
    }),
    prisma.taskProof.deleteMany({
      where: {
        submittedAt: { lt: cutoff },
        commitment: { day: { gte: cutoff } },
      },
    }),
    prisma.commitment.deleteMany({ where: { day: { lt: cutoff } } }),
    prisma.checkIn.deleteMany({ where: { day: { lt: cutoff } } }),
    prisma.screenTimeReceipt.deleteMany({
      where: { periodEnd: { lt: cutoff } },
    }),
    prisma.activityEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.aIRun.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.dailySquadDigest.deleteMany({ where: { day: { lt: cutoff } } }),
    prisma.invite.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.rateLimit.deleteMany({
      where: { lastRequest: { lt: BigInt(cutoff.getTime()) } },
    }),
  ]);
  return {
    days,
    cutoff,
    deleted: {
      revisions: revisions.count,
      proofs: proofs.count,
      commitments: commitments.count,
      checkIns: checkIns.count,
      receipts: receipts.count,
      activities: activities.count,
      aiRuns: aiRuns.count,
      digests: digests.count,
      invites: invites.count,
      verifications: verifications.count,
      sessions: sessions.count,
      rateLimits: rateLimits.count,
    },
  };
}
