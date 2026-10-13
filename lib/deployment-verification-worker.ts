import type { PgBoss } from "pg-boss";
import { notifyDeployment, verifyDeployment } from "./deployment-verification";
import { jobIdForKey } from "./queue";
import { releaseCommit } from "./release-id";

const queue = "verify-deployment";
type ReleaseJob = { commit: string; startedAt: number };

export async function registerDeploymentVerification(
  boss: PgBoss,
  shutdown: AbortSignal,
) {
  const webhook = process.env.DEPLOYMENT_DISCORD_WEBHOOK;
  if (!webhook || !releaseCommit || !/^[a-f0-9]{40}$/.test(releaseCommit)) {
    console.log(
      "Deployment verification disabled: release stamp or Discord webhook is not configured.",
    );
    return;
  }
  const options = {
    retryLimit: 3,
    retryDelay: 60,
    heartbeatSeconds: 60,
    expireInSeconds: 1500,
    deleteAfterSeconds: 90 * 86400,
  };
  await boss.createQueue(queue, options);
  await boss.updateQueue(queue, options);
  await boss.work<ReleaseJob>(
    queue,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      // A replacement worker must never announce an older, superseded release.
      if (job.data.commit !== releaseCommit) return { status: "superseded" };
      const signal = AbortSignal.any([shutdown, job.signal]);
      const result = await verifyDeployment({
        origin: process.env.NEXT_PUBLIC_APP_URL || "https://pickle-balls.com",
        commit: job.data.commit,
        startedAt: job.data.startedAt,
        signal,
      });
      await notifyDeployment(webhook, result, signal);
      console.log(
        JSON.stringify({ event: "deployment-verification", ...result }),
      );
      return result;
    },
  );
  // Completed jobs are durable receipts, so ordinary restarts do not notify again.
  await boss.send(
    queue,
    { commit: releaseCommit, startedAt: Date.now() },
    {
      id: jobIdForKey(queue, releaseCommit),
    },
  );
}
