import { setTimeout } from "node:timers/promises";
import { drainObjectDeletions } from "@/lib/deletion-storage";
import { DomainError } from "@/lib/errors";
import { startMediaProcessing, startPendingProof } from "@/lib/media-dispatch";
import { deleteVideoOriginal, processVideoMedia } from "@/lib/media-processing";
import { safeAppPath } from "@/lib/navigation";
import { shouldPushNotification } from "@/lib/notification-policy";
import { getNotificationPrefs } from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import type { JobPayloads } from "@/lib/queue";
import { pruneExpiredData } from "@/lib/retention";
import { readScreenTime } from "@/lib/screen-time-server";
import { sendStreakReminders } from "@/lib/streaks";
import { reconcileMissedTasks, submitProof } from "@/lib/tasks";

export const handlers = {
  "read-screen-time": async (data: JobPayloads["read-screen-time"]) => {
    try {
      return {
        ok: true,
        reading: await readScreenTime(
          data.userId,
          data.circleId,
          data.mediaId,
          data.week,
        ),
      };
    } catch (error) {
      if (error instanceof DomainError && error.status < 500)
        return { ok: false, message: error.message, status: error.status };
      throw new Error("Screen-time read unavailable");
    }
  },
  "process-media": async (
    { id, attempt }: JobPayloads["process-media"],
    signal: AbortSignal,
  ) => {
    const media = await getPrisma().mediaUpload.findUnique({ where: { id } });
    if (!media || media.encodeAttempt !== attempt) return;
    await processVideoMedia(id, signal);
    return { id };
  },
  "publish-media-proof": async (
    { id, attempt }: JobPayloads["publish-media-proof"],
    signal: AbortSignal,
  ) => {
    const prisma = getPrisma();
    // Waiting is asynchronous; the encoder has its own queue so a waiting post
    // cannot deadlock the video worker. A restart resumes from durable DB state.
    while (true) {
      signal.throwIfAborted();
      const pending = await prisma.pendingProof.findUnique({
        where: { id },
      });
      if (
        !pending ||
        pending.proofId ||
        pending.dismissed ||
        pending.attempt !== attempt
      )
        return;
      const member = await prisma.membership.findUnique({
        where: {
          userId_circleId: {
            userId: pending.ownerId,
            circleId: pending.circleId,
          },
        },
      });
      if (!member) throw new Error("Circle membership is no longer available.");
      let ready = true;
      for (const mediaId of pending.mediaIds) {
        const media = await prisma.mediaUpload.findUniqueOrThrow({
          where: { id: mediaId },
        });
        if (!media.ready) {
          if (media.processingError)
            throw new Error("Video processing failed.");
          await startMediaProcessing(mediaId);
          ready = false;
        }
      }
      if (ready) {
        const proof = await submitProof(
          pending.commitmentId,
          pending.ownerId,
          pending.circleId,
          pending.mediaIds,
          pending.note,
          pending.startedAt,
          pending.completedAt,
          pending.createdAt,
          pending.id,
        );
        return { proofId: proof.id };
      }
      await setTimeout(5000, undefined, { signal });
    }
  },
  notification: async ({ notificationId }: JobPayloads["notification"]) => {
    const prisma = getPrisma();
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.readAt) return { skipped: true };
    const member = await prisma.membership.findUnique({
      where: {
        userId_circleId: {
          userId: notification.recipientId,
          circleId: notification.circleId,
        },
      },
    });
    if (
      !member ||
      !shouldPushNotification(
        notification.kind,
        await getNotificationPrefs(notification.recipientId),
      )
    )
      return { skipped: true };
    const data = notification.data as Record<string, unknown> | null;
    return sendPushToUser(
      notification.recipientId,
      {
        title: notification.title,
        body: notification.body,
        url: safeAppPath(data?.url, "/"),
        tag: notification.id,
        notificationId: notification.id,
      },
      true,
    );
  },
  "reconcile-missed-tasks": async () => {
    const now = new Date();
    const circles = await getPrisma().circle.findMany({ select: { id: true } });
    let failed = 0;
    for (const circle of circles) {
      try {
        while ((await reconcileMissedTasks(circle.id, now)).hasMore) {
          /* drain all batches */
        }
      } catch {
        failed++;
      }
    }
    if (failed) throw new Error(`${failed} circles failed reconciliation`);
  },
  "prune-expired-data": async () => pruneExpiredData(),
  "streak-reminders": async () => sendStreakReminders(),
  "recover-media-posts": async () => {
    await drainObjectDeletions();
    const prisma = getPrisma();
    const pending = await prisma.pendingProof.findMany({
      where: {
        proofId: null,
        error: null,
        dismissed: false,
        createdAt: { lt: new Date(Date.now() - 60000) },
      },
      take: 100,
    });
    for (const item of pending) await startPendingProof(item.id);
    const cleanup = await prisma.mediaUpload.findMany({
      where: { ready: true, uploadId: { not: null } },
      select: { id: true },
      take: 100,
    });
    for (const media of cleanup) await deleteVideoOriginal(media.id);
  },
};

export async function markMediaFailed({
  id,
  attempt,
}: JobPayloads["process-media"]) {
  await getPrisma().mediaUpload.updateMany({
    where: { id, encodeAttempt: attempt, ready: false },
    data: {
      processingError:
        "Video processing failed. Retry, or choose another file if it keeps failing.",
    },
  });
}
export async function markProofFailed({
  id,
  attempt,
}: JobPayloads["publish-media-proof"]) {
  await getPrisma().pendingProof.updateMany({
    where: { id, attempt, proofId: null },
    data: { error: "Could not finish your post. Retry processing below." },
  });
}
