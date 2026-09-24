import { getPrisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
export const notificationRetentionMs = 7 * DAY_MS;
// Longer than the longest rate-limit window (1 hour), so no active window
// loses its count.
export const rateLimitRetentionMs = DAY_MS;

export async function pruneExpiredData(now = new Date()) {
  const prisma = getPrisma();
  const [sessions, verifications, rateLimits, notifications] =
    await Promise.all([
      prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.rateLimit.deleteMany({
        where: {
          lastRequest: { lt: BigInt(now.getTime() - rateLimitRetentionMs) },
        },
      }),
      prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: new Date(now.getTime() - notificationRetentionMs),
          },
        },
      }),
    ]);
  return {
    sessions: sessions.count,
    verifications: verifications.count,
    rateLimits: rateLimits.count,
    notifications: notifications.count,
  };
}
