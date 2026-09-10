import { schedules, task } from "@trigger.dev/sdk";
import { DomainError } from "@/lib/errors";
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

export const reconcileTasks = schedules.task({
  id: "reconcile-missed-tasks",
  cron: {
    pattern: "0 0 * * *",
    timezone: "America/Phoenix",
    environments: ["PRODUCTION"],
  },
  queue: { concurrencyLimit: 1 },
  run: async ({ timestamp }) => {
    const circles = await getPrisma().circle.findMany({ select: { id: true } });
    let reconciled = 0;
    let failed = 0;
    for (const circle of circles) {
      try {
        let count: number;
        do {
          const result = await reconcileMissedTasks(circle.id, timestamp);
          count = result.count;
          reconciled += count;
        } while (count === 25);
      } catch {
        failed++;
      }
    }
    // Finish other circles before retrying. Already reconciled tasks are skipped.
    if (failed) throw new Error(`${failed} circles failed reconciliation`);
    return { circles: circles.length, reconciled };
  },
});
