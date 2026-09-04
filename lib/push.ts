import "server-only";

import webpush from "web-push";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().min(1).max(2000).url(),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
  }),
  userAgent: z.string().trim().max(500).optional(),
});

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  notificationId?: string;
};

let vapidConfigured = false;

function ensureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@pickle-balls.com";
  if (!publicKey || !privateKey) {
    throw new Error("Push not configured. Missing VAPID keys.");
  }
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return { publicKey };
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

function isGoneError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const prisma = getPrisma();
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return { sent: 0, removed: 0 };
  ensureVapid();
  const body = JSON.stringify(payload);
  let sent = 0;
  const stale: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 24 * 7, urgency: "normal" },
        );
        sent += 1;
      } catch (error) {
        if (isGoneError(error)) {
          stale.push(sub.endpoint);
        } else {
          console.warn("Push delivery failed", { userId, error });
        }
      }
    }),
  );
  let removed = 0;
  if (stale.length > 0) {
    const result = await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint: { in: stale } },
    });
    removed = result.count;
  }
  return { sent, removed };
}
