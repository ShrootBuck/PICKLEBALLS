import { schedules, task } from "@trigger.dev/sdk";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { pruneExpiredData } from "@/lib/retention";
import { readScreenTime } from "@/lib/screen-time-server";
import { reconcileMissedTasks } from "@/lib/tasks";

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

export const reconcileTasks = schedules.task({
  id: "reconcile-missed-tasks",
  cron: {
    pattern: "0 * * * *",
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
        let hasMore: boolean;
        do {
          const result = await reconcileMissedTasks(circle.id, timestamp);
          hasMore = result.hasMore;
          reconciled += result.count;
        } while (hasMore);
      } catch {
        failed++;
      }
    }
    // Finish other circles before retrying. Already reconciled tasks are skipped.
    if (failed) throw new Error(`${failed} circles failed reconciliation`);
    return { circles: circles.length, reconciled };
  },
});

export const pruneData = schedules.task({
  id: "prune-expired-data",
  cron: {
    pattern: "30 3 * * *",
    timezone: "America/Phoenix",
    environments: ["PRODUCTION"],
  },
  queue: { concurrencyLimit: 1 },
  run: async ({ timestamp }) => pruneExpiredData(timestamp),
});
