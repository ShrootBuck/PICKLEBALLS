import "server-only";

import { extractScreenTime } from "@/lib/ai";
import { DomainError } from "@/lib/errors";
import { claimMedia } from "@/lib/media";
import { getPrisma } from "@/lib/prisma";
import { getMediaBytes } from "@/lib/r2";
import {
  latestScreenTimeWeek,
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
    raw = await extractScreenTime(userId, circleId, {
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
  const values = validateScreenTimeExtraction(raw);
  return serializable(async (tx) => {
    const existing = await tx.screenTimeReading.findFirst({
      where: { mediaId, userId, circleId },
    });
    if (existing) return existing;
    await claimMedia(tx, [mediaId], userId, circleId);
    if (expectedWeek !== latestScreenTimeWeek())
      throw new DomainError(
        "A new reporting week has opened. Reload and upload last week’s screenshot.",
        409,
      );
    const reading = await tx.screenTimeReading.create({
      data: {
        userId,
        circleId,
        mediaId,
        weekStart: requireDateKey(expectedWeek),
        ...values,
      },
    });
    const weekStart = requireDateKey(expectedWeek);
    await tx.screenTimeSubmission.upsert({
      where: { userId_circleId_weekStart: { userId, circleId, weekStart } },
      create: { userId, circleId, weekStart, readingId: reading.id },
      update: { readingId: reading.id },
    });
    return reading;
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
