import "server-only";

import { runs, tasks } from "@trigger.dev/sdk";
import { DomainError } from "@/lib/errors";
import * as notifications from "@/lib/notifications";
import { runProofAssessment } from "@/lib/proof-assessment";
import { readScreenTime } from "@/lib/screen-time-server";
import type {
  assessProof,
  proofReviewed,
  proofSubmitted,
  replyReceived,
  screenTimeRead,
} from "@/src/trigger/jobs";

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
  return tasks.trigger<typeof proofSubmitted>(
    "notify-proof-submitted",
    payload,
    { idempotencyKey: `proof:${payload.proofId}` },
  );
}
export async function notifyProofReviewed(
  payload: Parameters<typeof notifications.notifyProofReviewed>[0],
) {
  if (!backgroundTasksEnabled())
    return notifications.notifyProofReviewed(payload);
  return tasks.trigger<typeof proofReviewed>("notify-proof-reviewed", payload, {
    idempotencyKey: `review:${payload.reviewId}`,
  });
}
export async function notifyReplyReceived(
  payload: Parameters<typeof notifications.notifyReplyReceived>[0],
) {
  if (!backgroundTasksEnabled())
    return notifications.notifyReplyReceived(payload);
  return tasks.trigger<typeof replyReceived>("notify-reply-received", payload, {
    idempotencyKey: `reply:${payload.replyId}`,
  });
}

export async function readScreenTimeInBackground(
  userId: string,
  circleId: string,
  mediaId: string,
  week: string,
) {
  if (!backgroundTasksEnabled())
    return readScreenTime(userId, circleId, mediaId, week);
  const handle = await tasks.trigger<typeof screenTimeRead>(
    "read-screen-time",
    { userId, circleId, mediaId, week },
    {
      concurrencyKey: mediaId,
    },
  );
  const result = await runs.poll<typeof screenTimeRead>(handle.id, {
    pollIntervalMs: 1000,
  });
  if (!result.output)
    throw new DomainError(
      "The screenshot reader is unavailable. Try again shortly.",
      503,
    );
  if (!result.output.ok)
    throw new DomainError(result.output.message, result.output.status);
  return {
    ...result.output.reading,
    weekStart: new Date(result.output.reading.weekStart),
  };
}
