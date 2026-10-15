import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error(
    "Run with bun run test:integration against disposable Postgres.",
  );
mock.module("server-only", () => ({}));
const dispatch = mock(async () => {});
mock.module("@/lib/message-push-dispatch", () => ({
  dispatchMessagePushes: dispatch,
}));
const push = mock(
  async (
    _userId: string,
    _payload: { title: string; body: string; url: string; tag?: string },
    _retry?: boolean,
  ) => ({ sent: 1, removed: 0 }),
);
mock.module("@/lib/push", () => ({ sendPushToUser: push }));
const { getPrisma } = await import("@/lib/prisma");
const { sendDirectMessage, readDirectMessages, deleteDirectMessage } =
  await import("@/lib/direct-messages");
const { deliverMessagePush } = await import("@/lib/message-push");
const prisma = getPrisma();
const sender = "push-sender",
  recipient = "push-recipient",
  member = "push-member",
  outsider = "push-outsider";
const circle = "push-circle",
  dm = "push-dm",
  group = "push-group";
const send = (id = dm, body = "hello") =>
  sendDirectMessage(sender, id, { clientId: randomUUID(), body });
const deliveryFor = async (messageId: string, recipientId = recipient) =>
  prisma.messagePushDelivery.findUniqueOrThrow({
    where: { messageId_recipientId: { messageId, recipientId } },
  });
beforeAll(async () => {
  await prisma.user.createMany({
    data: [sender, recipient, member, outsider].map((id) => ({
      id,
      name: id,
      email: `${id}@example.invalid`,
    })),
  });
  await prisma.circle.create({
    data: { id: circle, name: "The group", slug: circle },
  });
  await prisma.membership.createMany({
    data: [sender, recipient, member].map((userId) => ({
      userId,
      circleId: circle,
    })),
  });
  await prisma.directConversation.createMany({
    data: [
      { id: dm, userAId: recipient, userBId: sender },
      { id: group, circleId: circle },
    ],
  });
});
beforeEach(async () => {
  push.mockClear();
  dispatch.mockClear();
  await prisma.notificationPreference.deleteMany({
    where: { userId: { in: [sender, recipient, member] } },
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});

test("DM sends save one delivery with the message, retries do not duplicate it, and pushes open the private chat", async () => {
  const input = { clientId: randomUUID(), body: " hello\nthere " };
  const message = await sendDirectMessage(sender, dm, input);
  expect((await sendDirectMessage(sender, dm, input)).id).toBe(message.id);
  const rows = await prisma.messagePushDelivery.findMany({
    where: { messageId: message.id },
  });
  expect(rows.map((row) => row.recipientId)).toEqual([recipient]);
  await Promise.all([
    deliverMessagePush(rows[0].id),
    deliverMessagePush(rows[0].id),
  ]);
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith(
    recipient,
    {
      title: sender,
      body: "hello there",
      url: `/messages?chat=${dm}`,
      tag: `message:${message.id}`,
    },
    true,
  );
  await deliverMessagePush(rows[0].id);
  expect(push).toHaveBeenCalledTimes(1);
  expect((await deliveryFor(message.id)).completedAt).not.toBeNull();
});

test("failed dispatch preserves the message and its recoverable delivery", async () => {
  dispatch.mockRejectedValueOnce(new Error("Queue is restarting"));
  const message = await send();
  expect((await deliveryFor(message.id)).completedAt).toBeNull();
  expect(
    await prisma.directMessage.findUnique({ where: { id: message.id } }),
  ).not.toBeNull();
});

test("group sends notify only other members and skip members who read or leave before delivery", async () => {
  const message = await send(group);
  const rows = await prisma.messagePushDelivery.findMany({
    where: { messageId: message.id },
  });
  expect(rows.map((row) => row.recipientId).sort()).toEqual(
    [recipient, member].sort(),
  );
  await readDirectMessages(recipient, group, message.sequence);
  await deliverMessagePush((await deliveryFor(message.id)).id);
  expect(push).not.toHaveBeenCalled();
  await deliverMessagePush((await deliveryFor(message.id, member)).id);
  expect(push).toHaveBeenCalledWith(
    member,
    expect.objectContaining({
      title: `${sender} in The group`,
      url: `/messages?chat=${group}&circle=${circle}`,
    }),
    true,
  );
  push.mockClear();
  const next = await send(group);
  await prisma.membership.delete({
    where: { userId_circleId: { userId: member, circleId: circle } },
  });
  await deliverMessagePush((await deliveryFor(next.id, member)).id);
  expect(push).not.toHaveBeenCalled();
  await prisma.membership.create({
    data: { userId: member, circleId: circle },
  });
});

test("read, deleted, and old messages do not send delayed alerts", async () => {
  const read = await send();
  await readDirectMessages(recipient, dm, read.sequence);
  await deliverMessagePush((await deliveryFor(read.id)).id);
  const deleted = await send();
  await deleteDirectMessage(sender, dm, deleted.id);
  await deliverMessagePush((await deliveryFor(deleted.id)).id);
  const stale = await send();
  await prisma.directMessage.update({
    where: { id: stale.id },
    data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) },
  });
  await deliverMessagePush((await deliveryFor(stale.id)).id);
  expect(push).not.toHaveBeenCalled();
});

test("DM and group preferences are independent and checked at delivery time", async () => {
  await prisma.notificationPreference.create({
    data: { userId: recipient, directMessages: false },
  });
  const direct = await send();
  await deliverMessagePush((await deliveryFor(direct.id)).id);
  expect(push).not.toHaveBeenCalled();
  const shared = await send(group);
  await deliverMessagePush((await deliveryFor(shared.id)).id);
  expect(push).toHaveBeenCalledTimes(1);
  push.mockClear();
  await prisma.notificationPreference.update({
    where: { userId: recipient },
    data: { directMessages: true, groupMessages: false },
  });
  await deliverMessagePush((await deliveryFor((await send(group)).id)).id);
  expect(push).not.toHaveBeenCalled();
  await deliverMessagePush((await deliveryFor((await send()).id)).id);
  expect(push).toHaveBeenCalledTimes(1);
});

test("photo-only messages get an attachment preview", async () => {
  const mediaId = `i_${randomUUID()}`;
  await prisma.mediaUpload.create({
    data: {
      id: mediaId,
      ownerId: sender,
      directConversationId: dm,
      ready: true,
      mimeType: "image/png",
      sizeBytes: 12,
      objectKey: `push/${mediaId}`,
    },
  });
  const message = await sendDirectMessage(sender, dm, {
    clientId: randomUUID(),
    body: "",
    mediaIds: [mediaId],
  });
  await deliverMessagePush((await deliveryFor(message.id)).id);
  expect(push).toHaveBeenCalledWith(
    recipient,
    expect.objectContaining({ body: "Sent a photo" }),
    true,
  );
});

test("provider failures retry with backoff and completed deliveries are not resent", async () => {
  const message = await send();
  const delivery = await deliveryFor(message.id);
  push.mockRejectedValueOnce(new Error("Provider unavailable"));
  await expect(deliverMessagePush(delivery.id)).rejects.toThrow(
    "Provider unavailable",
  );
  const failed = await deliveryFor(message.id);
  expect(failed.completedAt).toBeNull();
  expect(failed.attempts).toBe(1);
  expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  await deliverMessagePush(delivery.id);
  expect(push).toHaveBeenCalledTimes(1);
  await prisma.messagePushDelivery.update({
    where: { id: delivery.id },
    data: { nextAttemptAt: new Date(0) },
  });
  await deliverMessagePush(delivery.id);
  expect(push).toHaveBeenCalledTimes(2);
  expect((await deliveryFor(message.id)).completedAt).not.toBeNull();
});

test("invalid attachments roll back both message and delivery; removing a conversation cleans up its pending deliveries", async () => {
  const before = await prisma.messagePushDelivery.count();
  await expect(
    sendDirectMessage(sender, dm, {
      clientId: randomUUID(),
      body: "bad",
      mediaIds: ["i_missing"],
    }),
  ).rejects.toThrow();
  expect(await prisma.messagePushDelivery.count()).toBe(before);
  const chat = await prisma.directConversation.create({
    data: { userAId: outsider, userBId: sender },
  });
  const message = await send(chat.id);
  await prisma.directConversation.delete({ where: { id: chat.id } });
  expect(
    await prisma.messagePushDelivery.count({
      where: { messageId: message.id },
    }),
  ).toBe(0);
});
