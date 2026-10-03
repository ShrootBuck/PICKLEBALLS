import { createHash, randomUUID } from "node:crypto";
import { PgBoss, type Queue } from "pg-boss";

export const usesLocalWorker = () =>
  process.env.BACKGROUND_BACKEND === "postgres";
export const workerAvailable = () =>
  usesLocalWorker() || Boolean(process.env.TRIGGER_SECRET_KEY);

export type JobPayloads = {
  "read-screen-time": {
    userId: string;
    circleId: string;
    mediaId: string;
    week: string;
  };
  "process-media": { id: string; attempt: number };
  "publish-media-proof": { id: string; attempt: number };
  notification: { notificationId: string };
  "reconcile-missed-tasks": Record<string, never>;
  "prune-expired-data": Record<string, never>;
  "recover-media-posts": Record<string, never>;
  "streak-reminders": Record<string, never>;
};
export type JobName = keyof JobPayloads;
export const queues: Record<JobName, Omit<Queue, "name">> = {
  "read-screen-time": { policy: "exclusive", expireInSeconds: 300 },
  "process-media": {
    policy: "exclusive",
    expireInSeconds: 86400,
    deadLetter: "media-failures",
  },
  "publish-media-proof": {
    policy: "exclusive",
    expireInSeconds: 86400,
    deadLetter: "proof-failures",
  },
  notification: { policy: "exclusive", expireInSeconds: 120 },
  "reconcile-missed-tasks": { policy: "exclusive", expireInSeconds: 3600 },
  "prune-expired-data": { policy: "exclusive", expireInSeconds: 600 },
  "recover-media-posts": { policy: "exclusive", expireInSeconds: 300 },
  "streak-reminders": { policy: "exclusive", expireInSeconds: 600 },
};

export function jobIdForKey(name: string, key: string) {
  const bytes = createHash("sha256")
    .update(`${name}:${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function createQueueClient(worker = false) {
  if (!usesLocalWorker() || !process.env.DATABASE_URL)
    throw new Error(
      "Local worker requires BACKGROUND_BACKEND=postgres and DATABASE_URL.",
    );
  const boss = new PgBoss({
    connectionString: process.env.DATABASE_URL,
    schema: "pgboss",
    max: worker ? 5 : 2,
    migrate: worker,
    supervise: worker,
    schedule: worker,
    connectionTimeoutMillis: 10000,
  });
  // Avoid logging connection strings, payloads, or provider error bodies.
  boss.on("error", () =>
    console.error("Background queue connection or maintenance failed"),
  );
  try {
    await boss.start();
    if (worker) {
      for (const name of ["media-failures", "proof-failures"])
        await boss.createQueue(name, {
          retryLimit: 10,
          retryDelay: 30,
          heartbeatSeconds: 60,
        });
      for (const [name, config] of Object.entries(queues)) {
        const options = {
          retryLimit: 2,
          retryDelay: 10,
          retryBackoff: true,
          heartbeatSeconds: 60,
          deleteAfterSeconds: 7 * 86400,
          ...config,
        };
        await boss.createQueue(name, options);
        const { policy: _policy, ...mutableOptions } = options;
        await boss.updateQueue(name, mutableOptions);
      }
    }
    return boss;
  } catch (error) {
    await boss.stop().catch(() => {});
    throw error;
  }
}

let producer: Promise<PgBoss> | undefined;
export function getQueue() {
  producer ??= createQueueClient().catch((error) => {
    producer = undefined;
    throw error;
  });
  return producer;
}

export async function enqueueJob<N extends JobName>(
  name: N,
  data: JobPayloads[N],
  key?: string,
) {
  const boss = await getQueue();
  const id = key ? jobIdForKey(name, key) : randomUUID();
  await boss.send(name, data, {
    id,
    singletonKey: key ?? id,
    group: { id: name },
  });
  return { id };
}
