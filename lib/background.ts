import "server-only";
import { runs, tasks } from "@trigger.dev/sdk";
import { DomainError } from "@/lib/errors";
import {
  enqueueJob,
  getQueue,
  usesLocalWorker,
  workerAvailable,
} from "@/lib/queue";
import type { screenTimeRead } from "@/src/trigger/jobs";

export async function readScreenTimeInBackground(
  userId: string,
  circleId: string,
  mediaId: string,
  week: string,
) {
  if (!workerAvailable())
    throw new DomainError(
      "The screenshot reader is unavailable. Try again shortly.",
      503,
    );
  if (usesLocalWorker()) {
    const handle = await enqueueJob("read-screen-time", {
      userId,
      circleId,
      mediaId,
      week,
    });
    return { runId: handle.id };
  }
  const handle = await tasks.trigger<typeof screenTimeRead>(
    "read-screen-time",
    { userId, circleId, mediaId, week },
    { concurrencyKey: mediaId },
  );
  return { runId: handle.id };
}

export async function screenTimeReadStatus(
  runId: string,
  userId: string,
  circleId: string,
) {
  if (usesLocalWorker()) {
    const { localReadStatus } = await import("@/lib/worker-status");
    const run = /^[0-9a-f-]{36}$/i.test(runId)
      ? await (await getQueue()).getJobById<
          import("@/lib/queue").JobPayloads["read-screen-time"]
        >("read-screen-time", runId)
      : null;
    return localReadStatus(run, userId, circleId);
  }
  const run = await runs.retrieve<typeof screenTimeRead>(runId);
  if (
    run.taskIdentifier !== "read-screen-time" ||
    run.payload?.userId !== userId ||
    run.payload?.circleId !== circleId
  )
    throw new DomainError("That screenshot read is unavailable.", 404);
  if (!run.isCompleted) return { pending: true as const };
  if (!run.output)
    return {
      error: "The screenshot reader could not finish. Try uploading again.",
    };
  if (!run.output.ok) return { error: run.output.message };
  return { reading: run.output.reading };
}
