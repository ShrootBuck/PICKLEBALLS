import { schedules, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { mediaProcessingKey, startPendingProof } from "@/lib/media-dispatch";
import { deleteVideoOriginal, processVideoMedia } from "@/lib/media-processing";
import { getPrisma } from "@/lib/prisma";
import { submitProof } from "@/lib/tasks";
import { assessProof } from "@/src/trigger/jobs";
import { notification } from "@/src/trigger/notification";

export const processMedia = schemaTask({
  id: "process-media",
  schema: z.object({ id: z.string() }),
  machine: "medium-2x",
  maxDuration: 24 * 3600,
  queue: { concurrencyLimit: 2 },
  retry: { maxAttempts: 3 },
  onFailure: async ({ payload }) => {
    await getPrisma().mediaUpload.updateMany({
      where: { id: payload.id, ready: false },
      data: {
        processingError:
          "Video processing failed. Retry, or choose another file if it keeps failing.",
      },
    });
  },
  run: async ({ id }: { id: string }, { signal }) => {
    await processVideoMedia(id, signal);
    return { id };
  },
});

export const publishMediaProof = schemaTask({
  id: "publish-media-proof",
  schema: z.object({ id: z.string() }),
  maxDuration: 300,
  queue: { concurrencyLimit: 10 },
  onFailure: async ({ payload }) => {
    await getPrisma().pendingProof.updateMany({
      where: { id: payload.id, proofId: null },
      data: { error: "Could not finish your post. Retry processing below." },
    });
  },
  run: async ({ id }: { id: string }) => {
    const prisma = getPrisma();
    const pending = await prisma.pendingProof.findUniqueOrThrow({
      where: { id },
    });
    if (pending.dismissed && !pending.proofId) return;
    const member = await prisma.membership.findUnique({
      where: {
        userId_circleId: {
          userId: pending.ownerId,
          circleId: pending.circleId,
        },
      },
    });
    if (!member) throw new Error("Circle membership is no longer available.");
    for (const mediaId of pending.mediaIds) {
      const media = await prisma.mediaUpload.findUniqueOrThrow({
        where: { id: mediaId },
      });
      if (!media.ready) {
        const result = await processMedia.triggerAndWait(
          { id: mediaId },
          {
            idempotencyKey: await mediaProcessingKey(
              mediaId,
              media.encodeAttempt,
            ),
          },
        );
        if (!result.ok) throw new Error("Video processing failed.");
      }
    }
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
    await notification.trigger(
      {
        kind: "proof-submitted",
        proofId: proof.id,
        actorId: pending.ownerId,
        circleId: pending.circleId,
      },
      { idempotencyKey: `proof:${proof.id}` },
    );
    await assessProof.trigger(
      {
        proofId: proof.id,
        userId: pending.ownerId,
        circleId: pending.circleId,
      },
      { idempotencyKey: `proof-assess:${proof.id}` },
    );
    return { proofId: proof.id };
  },
});

// Recover the gap between the database commit and dispatch if a request disconnects.
export const recoverMediaPosts = schedules.task({
  id: "recover-media-posts",
  cron: {
    pattern: "*/5 * * * *",
    timezone: "UTC",
    environments: ["PRODUCTION"],
  },
  run: async () => {
    const pending = await getPrisma().pendingProof.findMany({
      where: {
        proofId: null,
        error: null,
        dismissed: false,
        createdAt: { lt: new Date(Date.now() - 60_000) },
      },
      take: 100,
    });
    for (const item of pending) await startPendingProof(item.id);
    const cleanup = await getPrisma().mediaUpload.findMany({
      where: { ready: true, uploadId: { not: null } },
      select: { id: true },
      take: 100,
    });
    for (const media of cleanup) await deleteVideoOriginal(media.id);
  },
});
