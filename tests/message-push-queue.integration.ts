import { afterAll, expect, mock, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error(
    "Run with bun run test:integration against disposable Postgres.",
  );
process.env.BACKGROUND_BACKEND = "postgres";
mock.module("server-only", () => ({}));
const push = mock(async () => ({ sent: 1, removed: 0 }));
mock.module("@/lib/push", () => ({ sendPushToUser: push }));
const { getPrisma } = await import("@/lib/prisma");
const { createQueueClient, getQueue } = await import("@/lib/queue");
const { sendDirectMessage } = await import("@/lib/direct-messages");
const { deliverMessagePush } = await import("@/lib/message-push");
const { recoverMessagePushes } = await import("@/lib/message-push-dispatch");
const prisma = getPrisma();
const boss = await createQueueClient(true);
afterAll(async () => {
  await (await getQueue()).stop();
  await boss.stop();
  await prisma.$disconnect();
});

test("the Postgres queue delivers chat alerts and recovers a job that crashed before claiming its delivery", async () => {
  const ids = ["queue-push-a", "queue-push-b"];
  await prisma.user.createMany({
    data: ids.map((id) => ({ id, name: id, email: `${id}@example.invalid` })),
  });
  const conversation = await prisma.directConversation.create({
    data: { userAId: ids[0], userBId: ids[1] },
  });
  const send = () =>
    sendDirectMessage(ids[0], conversation.id, {
      clientId: randomUUID(),
      body: "Queued message",
    });
  const fetch = async () => {
    const [job] = await boss.fetch<{ deliveryId: string }>(
      "message-notification",
    );
    expect(job).toBeDefined();
    return job;
  };
  await send();
  const first = await fetch();
  await deliverMessagePush(first.data.deliveryId);
  await boss.complete("message-notification", first.id);
  expect(push).toHaveBeenCalledTimes(1);

  const message = await send();
  const failed = await fetch();
  await boss.fail(
    "message-notification",
    failed.id,
    new Error("Worker stopped"),
  );
  expect(
    (
      await prisma.messagePushDelivery.findUniqueOrThrow({
        where: { id: failed.data.deliveryId },
      })
    ).attempts,
  ).toBe(0);
  const nextSlot = Date.now() + 60_000;
  const clock = spyOn(Date, "now").mockReturnValue(nextSlot);
  try {
    await recoverMessagePushes();
  } finally {
    clock.mockRestore();
  }
  const recovered = await fetch();
  expect(recovered.id).not.toBe(failed.id);
  expect(recovered.data.deliveryId).toBe(failed.data.deliveryId);
  await deliverMessagePush(recovered.data.deliveryId);
  await boss.complete("message-notification", recovered.id);
  expect(push).toHaveBeenCalledTimes(2);
  expect(
    (
      await prisma.messagePushDelivery.findUniqueOrThrow({
        where: {
          messageId_recipientId: { messageId: message.id, recipientId: ids[1] },
        },
      })
    ).completedAt,
  ).not.toBeNull();
}, 20_000);
