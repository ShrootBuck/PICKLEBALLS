import "server-only";
import { runs, tasks } from "@trigger.dev/sdk";
import { DomainError } from "@/lib/errors";
import type { screenTimeRead } from "@/src/trigger/jobs";

export async function readScreenTimeInBackground(
  userId: string,
  circleId: string,
  mediaId: string,
  week: string,
) {
  if (!process.env.TRIGGER_SECRET_KEY)
    throw new DomainError(
      "The screenshot reader is unavailable. Try again shortly.",
      503,
    );
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
