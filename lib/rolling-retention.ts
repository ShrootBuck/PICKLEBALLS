import "server-only";

import { getPrisma } from "@/lib/prisma";

export const rollingWindowDays = 30;
const appTimeZone = "America/Phoenix";

function phoenixDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: appTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: read("year"), month: read("month"), day: read("day") };
}

export function getRollingWindow(now = new Date()) {
  const { year, month, day } = phoenixDateParts(now);
  const today = Date.UTC(year, month - 1, day);
  const cutoff = new Date(
    today - (rollingWindowDays - 1) * 24 * 60 * 60 * 1000,
  );

  return { days: rollingWindowDays, cutoff };
}

export async function pruneExpiredAppData(now = new Date()) {
  const window = getRollingWindow(now);
  const prisma = getPrisma();
  const [
    commitments,
    checkIns,
    receipts,
    invites,
    verifications,
    sessions,
    rateLimits,
  ] = await prisma.$transaction([
    prisma.commitment.deleteMany({ where: { day: { lt: window.cutoff } } }),
    prisma.checkIn.deleteMany({ where: { day: { lt: window.cutoff } } }),
    prisma.screenTimeReceipt.deleteMany({
      where: { reportDate: { lt: window.cutoff } },
    }),
    prisma.invite.deleteMany({ where: { createdAt: { lt: window.cutoff } } }),
    prisma.verification.deleteMany({
      where: { createdAt: { lt: window.cutoff } },
    }),
    prisma.session.deleteMany({ where: { createdAt: { lt: window.cutoff } } }),
    prisma.rateLimit.deleteMany({
      where: { lastRequest: { lt: BigInt(window.cutoff.getTime()) } },
    }),
  ]);

  return {
    ...window,
    deleted: {
      commitments: commitments.count,
      checkIns: checkIns.count,
      receipts: receipts.count,
      invites: invites.count,
      verifications: verifications.count,
      sessions: sessions.count,
      rateLimits: rateLimits.count,
    },
  };
}
