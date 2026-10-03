import { createServer } from "node:http";
import { getPrisma } from "@/lib/prisma";
import { createQueueClient, type JobName, type JobPayloads } from "@/lib/queue";
import {
  handlers,
  markMediaFailed,
  markProofFailed,
} from "@/lib/worker-handlers";

const boss = await createQueueClient(true);
const shutdown = new AbortController();
let ready = false;
const health = createServer(async (_req, res) => {
  try {
    if (!ready) throw new Error("Not ready");
    await getPrisma().$queryRaw`SELECT 1`;
    res.writeHead(200).end("ok");
  } catch {
    res.writeHead(503).end("unavailable");
  }
}).listen(3001, "0.0.0.0");

async function register<N extends JobName>(name: N, concurrency = 1) {
  await boss.work<JobPayloads[N]>(
    name,
    {
      batchSize: 1,
      includeMetadata: true,
      localConcurrency: concurrency,
      localGroupConcurrency: concurrency,
      pollingIntervalSeconds: 2,
    },
    async ([job]) => {
      const signal = AbortSignal.any([job.signal, shutdown.signal]);
      const handler = handlers[name] as (
        data: JobPayloads[N],
        signal: AbortSignal,
      ) => Promise<unknown>;
      return handler(job.data, signal);
    },
  );
}
await register("process-media");
await register("read-screen-time");
await register("publish-media-proof", 5);
await register("notification", 3);
await register("reconcile-missed-tasks");
await register("prune-expired-data");
await register("recover-media-posts");
await register("streak-reminders");
// Dead-letter handlers also catch terminal failures caused by killed containers
// or expired leases, which an in-process catch block cannot observe.
await boss.work<JobPayloads["process-media"]>("media-failures", async ([job]) =>
  markMediaFailed(job.data),
);
await boss.work<JobPayloads["publish-media-proof"]>(
  "proof-failures",
  async ([job]) => markProofFailed(job.data),
);
if (process.env.WORKER_SCHEDULES_ENABLED === "true") {
  await boss.schedule(
    "reconcile-missed-tasks",
    "0 * * * *",
    {},
    {
      tz: "America/Phoenix",
      singletonKey: "schedule",
      group: { id: "reconcile-missed-tasks" },
      missed: "once",
    },
  );
  await boss.schedule(
    "prune-expired-data",
    "30 3 * * *",
    {},
    {
      tz: "America/Phoenix",
      singletonKey: "schedule",
      group: { id: "prune-expired-data" },
      missed: "once",
    },
  );
  await boss.schedule(
    "recover-media-posts",
    "*/5 * * * *",
    {},
    {
      tz: "UTC",
      singletonKey: "schedule",
      group: { id: "recover-media-posts" },
      missed: "once",
    },
  );
  await boss.schedule(
    "streak-reminders",
    "2 * * * *",
    {},
    {
      tz: "America/Phoenix",
      singletonKey: "schedule",
      group: { id: "streak-reminders" },
      missed: "once",
    },
  );
} else {
  for (const name of [
    "reconcile-missed-tasks",
    "prune-expired-data",
    "recover-media-posts",
    "streak-reminders",
  ])
    await boss.unschedule(name);
}
ready = true;
console.log(
  "Local worker ready; video concurrency=1; schedules=" +
    (process.env.WORKER_SCHEDULES_ENABLED === "true"),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    ready = false;
    shutdown.abort();
    health.close();
    await boss.stop({ graceful: true, timeout: 25000 });
    await getPrisma().$disconnect();
    process.exit(0);
  });
