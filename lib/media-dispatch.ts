import "server-only";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { enqueueJob, usesLocalWorker, workerAvailable } from "@/lib/queue";
import type { processMedia, publishMediaProof } from "@/src/trigger/media";

function requireWorker() {
  if (!workerAvailable())
    throw new DomainError(
      "Video processing is unavailable. Try again shortly.",
      503,
    );
}
export async function mediaProcessingKey(id: string, attempt: number) {
  return idempotencyKeys.create(`encode:${id}:${attempt}`, { scope: "global" });
}
export async function startMediaProcessing(id: string) {
  requireWorker();
  const media = await getPrisma().mediaUpload.findUniqueOrThrow({
    where: { id },
  });
  if (media.ready) return;
  if (usesLocalWorker())
    return enqueueJob(
      "process-media",
      { id, attempt: media.encodeAttempt },
      `encode:${id}:${media.encodeAttempt}`,
    );
  return tasks.trigger<typeof processMedia>(
    "process-media",
    { id },
    { idempotencyKey: await mediaProcessingKey(id, media.encodeAttempt) },
  );
}
export async function startPendingProof(id: string) {
  requireWorker();
  const pending = await getPrisma().pendingProof.findUniqueOrThrow({
    where: { id },
  });
  if (pending.proofId) return;
  if (usesLocalWorker())
    return enqueueJob(
      "publish-media-proof",
      { id, attempt: pending.attempt },
      `publish:${id}:${pending.attempt}`,
    );
  return tasks.trigger<typeof publishMediaProof>(
    "publish-media-proof",
    { id },
    {
      idempotencyKey: await idempotencyKeys.create(
        `publish:${id}:${pending.attempt}`,
        { scope: "global" },
      ),
    },
  );
}
