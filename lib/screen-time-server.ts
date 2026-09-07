import "server-only";

import { extractScreenTime } from "@/lib/ai";
import { DomainError } from "@/lib/errors";
import { claimMedia } from "@/lib/media";
import { createNotificationAndPush } from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { getMediaBytes } from "@/lib/r2";
import {
  latestScreenTimeWeek,
  screenTimeWeekLabel,
  validateScreenTimeExtraction,
} from "@/lib/screen-time";
import { requireDateKey } from "@/lib/time";
import { serializable } from "@/lib/transaction";

export async function readScreenTime(
  userId: string,
  circleId: string,
  mediaId: string,
  requestedWeek: string,
) {
  const expectedWeek = latestScreenTimeWeek();
  if (requestedWeek !== expectedWeek)
    throw new DomainError(
      "A new reporting week has opened. Reload and upload the dates shown.",
      409,
    );
  const prisma = getPrisma();
  // A lost response can be retried without another AI call or media claim.
  const existing = await prisma.screenTimeReading.findFirst({
    where: {
      mediaId,
      userId,
      circleId,
      weekStart: requireDateKey(expectedWeek),
    },
  });
  if (existing) return existing;
  const media = await prisma.mediaUpload.findFirst({
    where: {
      id: mediaId,
      ownerId: userId,
      circleId,
      ready: true,
      claimed: false,
    },
  });
  if (!media || !media.mimeType.startsWith("image/"))
    throw new DomainError("Choose one available screenshot, not a video.");
  const data = await getMediaBytes(media.objectKey);
  let raw: unknown;
  try {
    raw = await extractScreenTime(userId, circleId, expectedWeek, {
      data,
      mimeType: media.mimeType,
    });
  } catch (error) {
    // Provider errors can contain image bodies; never pass them to the API logger.
    if (error instanceof Error && error.message === "AI_RATE_LIMIT")
      throw new DomainError("Too many AI reads. Try again in an hour.", 429);
    throw new DomainError(
      "The screenshot reader is unavailable. Your existing submission is safe; try again shortly.",
      503,
    );
  }
  const values = validateScreenTimeExtraction(raw, expectedWeek);
  return serializable(async (tx) => {
    const existing = await tx.screenTimeReading.findFirst({
      where: { mediaId, userId, circleId },
    });
    if (existing) return existing;
    await claimMedia(tx, [mediaId], userId, circleId);
    return tx.screenTimeReading.create({
      data: {
        userId,
        circleId,
        mediaId,
        weekStart: requireDateKey(expectedWeek),
        ...values,
      },
    });
  });
}

export async function confirmScreenTime(
  userId: string,
  circleId: string,
  readingId: string,
) {
  return serializable(async (tx) => {
    const weekStart = requireDateKey(latestScreenTimeWeek());
    const reading = await tx.screenTimeReading.findFirst({
      where: { id: readingId, userId, circleId, weekStart },
    });
    if (!reading)
      throw new DomainError(
        "That read is unavailable or its reporting week has closed. Upload the dates shown.",
        409,
      );
    // Values are taken from the server's validated read, never the request body.
    return tx.screenTimeSubmission.upsert({
      where: { userId_circleId_weekStart: { userId, circleId, weekStart } },
      create: { userId, circleId, weekStart, readingId },
      update: { readingId },
    });
  });
}

export async function sendScreenTimeReminders(now = new Date()) {
  const week = latestScreenTimeWeek(now);
  const weekStart = requireDateKey(week);
  const prisma = getPrisma();
  const members = await prisma.membership.findMany({
    select: {
      userId: true,
      circleId: true,
      circle: { select: { name: true } },
    },
  });
  let sent = 0;
  let failed = 0;
  for (const member of members) {
    try {
      if (
        await prisma.screenTimeSubmission.findUnique({
          where: {
            userId_circleId_weekStart: {
              userId: member.userId,
              circleId: member.circleId,
              weekStart,
            },
          },
          select: { id: true },
        })
      )
        continue;
      const notification = await createNotificationAndPush({
        recipientId: member.userId,
        actorId: member.userId,
        circleId: member.circleId,
        kind: "SCREEN_TIME_REMINDER",
        title: "Your weekly screen time is due",
        body: `${member.circle.name}: upload ${screenTimeWeekLabel(week)}. Choose Week in Screen Time, then go back one week.`,
        data: { url: `/screen-time?week=${week}` },
        dedupeKey: `screen-time:${member.circleId}:${member.userId}:${week}`,
        allowSelf: true,
      });
      if (notification) sent++;
    } catch {
      failed++;
      console.warn("Screen-time reminder failed", {
        userId: member.userId,
        circleId: member.circleId,
      });
    }
  }
  return { sent, failed };
}
