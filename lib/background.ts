import type { notification } from "@/src/trigger/notification";
import "server-only";

import { runs, tasks } from "@trigger.dev/sdk";
import { DomainError } from "@/lib/errors";
import * as notifications from "@/lib/notifications";
import { runProofAssessment } from "@/lib/proof-assessment";
import { readScreenTime } from "@/lib/screen-time-server";
import type { assessProof, screenTimeRead } from "@/src/trigger/jobs";

export function backgroundTasksEnabled() {
  return Boolean(process.env.TRIGGER_SECRET_KEY);
}

export async function assessProofInBackground(
  proofId: string,
  userId: string,
  circleId: string,
) {
  if (!backgroundTasksEnabled())
    return runProofAssessment(proofId, userId, circleId);
  const handle = await tasks.trigger<typeof assessProof>(
    "assess-proof",
    { proofId, userId, circleId },
    {
      concurrencyKey: proofId,
    },
  );
  // The response observes completion; the worker continues if the client disconnects.
  await runs.poll(handle.id, { pollIntervalMs: 1500 });
}

export async function notifyProofSubmitted(
  payload: Parameters<typeof notifications.notifyProofSubmitted>[0],
) {
  if (!backgroundTasksEnabled())
    return notifications.notifyProofSubmitted(payload);
  return tasks.trigger<typeof notification>(
    "notification",
    { kind: "proof-submitted", ...payload },
    { idempotencyKey: `proof:${payload.proofId}` },
  );
}
export async function notifyProofReviewed(
  payload: Parameters<typeof notifications.notifyProofReviewed>[0],
) {
  if (!backgroundTasksEnabled())
    return notifications.notifyProofReviewed(payload);
  return tasks.trigger<typeof notification>(
    "notification",
    { kind: "proof-reviewed", ...payload },
    {
      idempotencyKey: `review:${payload.reviewId}`,
    },
  );
}
export async function notifyReplyReceived(
  payload: Parameters<typeof notifications.notifyReplyReceived>[0],
) {
  if (!backgroundTasksEnabled())
    return notifications.notifyReplyReceived(payload);
  return tasks.trigger<typeof notification>(
    "notification",
    { kind: "reply-received", ...payload },
    {
      idempotencyKey: `reply:${payload.replyId}`,
    },
  );
}

export async function readScreenTimeInBackground(
  userId: string,
  circleId: string,
  mediaId: string,
  week: string,
) {
  if (!backgroundTasksEnabled())
    return { reading: await readScreenTime(userId, circleId, mediaId, week) };
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
