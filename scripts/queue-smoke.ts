import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { createQueueClient, jobIdForKey } from "../lib/queue";

if (
  process.env.PB_QUEUE_TEST !== "disposable" ||
  !new URL(process.env.DATABASE_URL || "").pathname.startsWith(
    "/pb_queue_test_",
  )
)
  throw new Error("Requires a disposable queue-test database");
let boss = await createQueueClient(true);
async function waitFor(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await setTimeout(100);
  }
  throw new Error(`Timed out: ${label}`);
}
try {
  const queue = "smoke";
  await boss.createQueue(queue, {
    policy: "exclusive",
    retryLimit: 1,
    retryDelay: 1,
  });
  const id = jobIdForKey(queue, "duplicate");
  assert.equal(
    await boss.send(queue, { marker: true }, { id, singletonKey: "duplicate" }),
    id,
  );
  assert.equal(
    await boss.send(queue, { marker: true }, { id, singletonKey: "duplicate" }),
    null,
  );
  // Restart the producer before consuming: a job must live in Postgres.
  await boss.stop();
  boss = await createQueueClient(true);
  let calls = 0;
  await boss.work(queue, { pollingIntervalSeconds: 0.5 }, async () => {
    calls++;
    if (calls === 1) throw new Error("intentional retry");
    return { result: "survived restart and retry" };
  });
  await waitFor(
    async () => (await boss.getJobById(queue, id))?.state === "completed",
    "retry completion",
  );
  assert.equal(calls, 2);
  assert.deepEqual((await boss.getJobById(queue, id))?.output, {
    result: "survived restart and retry",
  });
  await boss.createQueue("serial");
  let active = 0;
  let maximum = 0;
  let completed = 0;
  const handler = async () => {
    active++;
    maximum = Math.max(maximum, active);
    await setTimeout(200);
    active--;
    completed++;
  };
  await boss.work(
    "serial",
    {
      localConcurrency: 3,
      localGroupConcurrency: 1,
      pollingIntervalSeconds: 0.5,
    },
    handler,
  );
  for (let i = 0; i < 3; i++)
    await boss.send("serial", {}, { group: { id: "video" } });
  await waitFor(async () => completed === 3, "serial group");
  assert.equal(maximum, 1);
  // An expired attempt must be recovered after its consumer disappears.
  await boss.createQueue("crash", { expireInSeconds: 1, retryLimit: 1 });
  const crashId = randomUUID();
  await boss.send("crash", {}, { id: crashId });
  await boss.fetch("crash");
  await boss.stop();
  await setTimeout(1200);
  boss = await createQueueClient(true);
  await boss.supervise("crash");
  await boss.work("crash", { pollingIntervalSeconds: 0.5 }, async () => ({
    recovered: true,
  }));
  await waitFor(
    async () =>
      (await boss.getJobById("crash", crashId))?.state === "completed",
    "expired attempt recovery",
  );
  console.log(
    "Queue smoke PASS: durable restart, deduplication, retry, serial video group, crash recovery",
  );
} finally {
  await boss.stop();
}
