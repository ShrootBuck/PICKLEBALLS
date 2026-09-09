import { schedules, task } from "@trigger.dev/sdk";
import { DomainError } from "@/lib/errors";
import {
  notifyProofReviewed,
  notifyProofSubmitted,
  notifyReplyReceived,
} from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { runProofAssessment } from "@/lib/proof-assessment";
import {
  readScreenTime,
  sendScreenTimeReminders,
} from "@/lib/screen-time-server";
import { reconcileMissedTasks } from "@/lib/tasks";

export const assessProof = task({
  id: "assess-proof",
  onFailure: async ({ payload }) => {
    await getPrisma().taskProof.updateMany({
      where: {
        id: payload.proofId,
        circleId: payload.circleId,
        aiStatus: "PENDING",
      },
      data: { aiStatus: "FAILED" },
    });
  },
  queue: { concurrencyLimit: 1 },
  run: async (payload: {
    proofId: string;
    userId: string;
    circleId: string;
  }) => {
    await runProofAssessment(
      payload.proofId,
      payload.userId,
      payload.circleId,
      true,
    );
  },
});

export const screenTimeRead = task({
  id: "read-screen-time",
  queue: { concurrencyLimit: 1 },
  run: async (payload: {
    userId: string;
    circleId: string;
    mediaId: string;
    week: string;
  }) => {
    try {
      const reading = await readScreenTime(
        payload.userId,
        payload.circleId,
        payload.mediaId,
        payload.week,
      );
      return { ok: true as const, reading };
    } catch (error) {
      if (error instanceof DomainError && error.status < 500) {
        return {
          ok: false as const,
          message: error.message,
          status: error.status,
        };
      }
      throw new Error("Screen-time read unavailable");
    }
  },
});

export const proofSubmitted = task({
  id: "notify-proof-submitted",
  run: (payload: Parameters<typeof notifyProofSubmitted>[0]) =>
    notifyProofSubmitted(payload),
});
export const proofReviewed = task({
  id: "notify-proof-reviewed",
  run: (payload: Parameters<typeof notifyProofReviewed>[0]) =>
    notifyProofReviewed(payload),
});
export const replyReceived = task({
  id: "notify-reply-received",
  run: (payload: Parameters<typeof notifyReplyReceived>[0]) =>
    notifyReplyReceived(payload),
});

export const screenTimeReminders = schedules.task({
  id: "screen-time-reminders",
  cron: {
    pattern: "0 17 * * 0",
    timezone: "UTC",
    environments: ["PRODUCTION"],
  },
  queue: { concurrencyLimit: 1 },
  run: async ({ timestamp }) => {
    const result = await sendScreenTimeReminders(timestamp);
    if (result.failed) throw new Error(`${result.failed} reminders failed`);
    return result;
  },
});

export const reconcileCircle = task({
  id: "reconcile-circle",
  queue: { concurrencyLimit: 3 },
  run: async (payload: { circleId: string; now: string }) => {
    let reconciled = 0;
    let count: number;
    do {
      const result = await reconcileMissedTasks(
        payload.circleId,
        new Date(payload.now),
      );
      count = result.count;
      reconciled += count;
    } while (count === 25);
    return { reconciled };
  },
});

export const reconcileTasks = schedules.task({
  id: "reconcile-missed-tasks",
  cron: { pattern: "5 7 * * *", timezone: "UTC", environments: ["PRODUCTION"] },
  queue: { concurrencyLimit: 1 },
  run: async ({ timestamp }) => {
    const circles = await getPrisma().circle.findMany({ select: { id: true } });
    // Each circle retries independently; use batches within the API's item limit.
    for (let offset = 0; offset < circles.length; offset += 100) {
      const result = await reconcileCircle.batchTriggerAndWait(
        circles.slice(offset, offset + 100).map(({ id }) => ({
          payload: { circleId: id, now: timestamp.toISOString() },
        })),
      );
      if (result.runs.some((run) => !run.ok))
        throw new Error("Circle reconciliation failed");
    }
    return { circles: circles.length };
  },
});
