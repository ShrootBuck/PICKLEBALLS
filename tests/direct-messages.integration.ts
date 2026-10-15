import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error(
    "Run with bun run test:integration. This suite requires disposable Postgres.",
  );
mock.module("server-only", () => ({}));
mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        return id ? { user: { id } } : null;
      },
    },
  },
}));
const { getPrisma } = await import("@/lib/prisma");
const {
  directContacts,
  directInbox,
  directThread,
  directUnreadCount,
  startDirectConversation,
  sendDirectMessage,
  readDirectMessages,
  reactToDirectMessage,
  deleteDirectMessage,
} = await import("@/lib/direct-messages");
const { authorizedMedia } = await import("@/lib/media-access");
const { claimMedia } = await import("@/lib/media");
const { changeCircleLifecycle, deleteOwnAccount } = await import(
  "@/lib/deletions"
);
const prisma = getPrisma();
const a = "dm-a",
  b = "dm-b",
  c = "dm-c",
  stranger = "dm-stranger";
const circle = "dm-circle",
  otherCircle = "dm-other";
const headers = (user: string, activeCircle = circle) =>
  new Headers({
    "x-test-user": user,
    cookie: `pb_active_circle=${activeCircle}`,
  });
const input = (body = "hello", mediaIds: string[] = []) => ({
  body,
  mediaIds,
  clientId: randomUUID(),
});
async function upload(
  ownerId: string,
  conversationId: string | null,
  ready = true,
) {
  return prisma.mediaUpload.create({
    data: {
      id: `i_${randomUUID()}`,
      ownerId,
      circleId: conversationId ? null : circle,
      directConversationId: conversationId,
      ready,
      mimeType: "image/png",
      sizeBytes: 32,
      objectKey: `dm-test/${randomUUID()}`,
    },
  });
}
beforeAll(async () => {
  await prisma.user.createMany({
    data: [a, b, c, stranger].map((id) => ({
      id,
      name: id,
      email: `${id}@example.invalid`,
    })),
  });
  await prisma.circle.createMany({
    data: [circle, otherCircle].map((id) => ({ id, name: id, slug: id })),
  });
  await prisma.membership.createMany({
    data: [
      { userId: a, circleId: circle, role: "OWNER" },
      { userId: b, circleId: circle },
      { userId: c, circleId: circle },
      { userId: a, circleId: otherCircle },
      { userId: stranger, circleId: otherCircle },
    ],
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});

test("only shared-circle contacts can start a chat, with exactly one conversation per pair under concurrent starts", async () => {
  expect((await directContacts(b)).map((p) => p.id).sort()).toEqual([a, c]);
  await expect(startDirectConversation(a, a)).rejects.toThrow("someone else");
  await expect(startDirectConversation(b, stranger)).rejects.toThrow(
    "in your circles",
  );
  const conversations = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      startDirectConversation(i % 2 ? b : a, i % 2 ? a : b),
    ),
  );
  expect(new Set(conversations.map((chat) => chat.id)).size).toBe(1);
  expect(
    await prisma.directConversation.count({
      where: { userAId: a, userBId: b },
    }),
  ).toBe(1);
});

test("concurrent sends are ordered, retries are idempotent, and reading cannot acknowledge an unseen arrival", async () => {
  const { id } = await startDirectConversation(a, b);
  const retry = input();
  const sent = await Promise.all([
    sendDirectMessage(a, id, retry),
    sendDirectMessage(b, id, input("reply")),
    sendDirectMessage(a, id, input("next")),
  ]);
  expect(new Set(sent.map((message) => message.sequence)).size).toBe(3);
  expect((await sendDirectMessage(a, id, retry)).id).toBe(sent[0].id);
  expect(
    await prisma.directMessage.count({ where: { conversationId: id } }),
  ).toBe(3);
  const page = await directThread(b, id);
  const through = page.messages.at(-1)?.sequence ?? 0;
  await sendDirectMessage(a, id, input("arrived after the page loaded"));
  await readDirectMessages(b, id, through);
  expect(await directUnreadCount(b)).toBe(1);
  expect((await directInbox(b))[0].unread).toBe(1);
  expect((await directInbox(c)).length).toBe(0);
});

test("another circle member cannot read, send, acknowledge, react, or delete in someone else's conversation", async () => {
  const { id } = await startDirectConversation(a, b);
  const message = await sendDirectMessage(a, id, input("private"));
  for (const operation of [
    () => directThread(c, id),
    () => sendDirectMessage(c, id, input()),
    () => readDirectMessages(c, id, 999),
    () => reactToDirectMessage(c, id, message.id, { emoji: "🔥" }),
    () => deleteDirectMessage(c, id, message.id),
    () => deleteDirectMessage(b, id, message.id),
  ])
    await expect(operation()).rejects.toThrow("not found");
});

test("attachment claims enforce owner, ready status and conversation scope, with atomic rollback", async () => {
  const ab = await startDirectConversation(a, b);
  const ac = await startDirectConversation(a, c);
  const own = await upload(a, ab.id);
  const stolen = await upload(b, ab.id);
  const unready = await upload(a, ab.id, false);
  const elsewhere = await upload(a, ac.id);
  const publicPhoto = await upload(a, null);
  expect(await authorizedMedia(headers(a), own.id)).toBeNull();
  for (const invalid of [stolen, unready, elsewhere, publicPhoto]) {
    await expect(
      sendDirectMessage(a, ab.id, input("", [own.id, invalid.id])),
    ).rejects.toThrow("Attachments");
    expect(
      (await prisma.mediaUpload.findUniqueOrThrow({ where: { id: own.id } }))
        .claimed,
    ).toBe(false);
  }
  await expect(
    prisma.$transaction((tx) => claimMedia(tx, [own.id], a, circle)),
  ).rejects.toThrow("Attachments");
  const request = input("", [own.id]);
  const sent = await sendDirectMessage(a, ab.id, request);
  expect((await sendDirectMessage(a, ab.id, request)).id).toBe(sent.id);
  expect((await authorizedMedia(headers(a, otherCircle), own.id))?.id).toBe(
    own.id,
  );
  expect((await authorizedMedia(headers(b), own.id))?.id).toBe(own.id);
  expect(await authorizedMedia(headers(c), own.id)).toBeNull();
  expect(await authorizedMedia(headers(stranger), own.id)).toBeNull();
  expect(await authorizedMedia(new Headers(), own.id)).toBeNull();
  await expect(
    sendDirectMessage(a, ab.id, input("reuse", [own.id])),
  ).rejects.toThrow("Attachments");
});

test("reactions can be changed and removed, and deletion propagates while queuing private attachment cleanup", async () => {
  const { id } = await startDirectConversation(a, b);
  const media = await upload(a, id);
  const message = await sendDirectMessage(a, id, input("nice", [media.id]));
  let changed = await reactToDirectMessage(b, id, message.id, { emoji: "🔥" });
  expect(changed.reactions).toEqual([{ userId: b, emoji: "🔥" }]);
  changed = await reactToDirectMessage(b, id, message.id, { emoji: "❤️" });
  expect(changed.reactions).toEqual([{ userId: b, emoji: "❤️" }]);
  changed = await reactToDirectMessage(b, id, message.id, { emoji: null });
  expect(changed.reactions).toEqual([]);
  await expect(
    reactToDirectMessage(b, id, message.id, { emoji: "bad" }),
  ).rejects.toThrow("Choose a reaction");
  const deleted = await deleteDirectMessage(a, id, message.id);
  expect(deleted.deletedAt).not.toBeNull();
  expect(deleted.body).toBe("");
  expect(deleted.mediaIds).toEqual([]);
  expect(
    (await directThread(b, id, { sinceRevision: changed.revision })).messages,
  ).toEqual([deleted]);
  expect(await authorizedMedia(headers(b), media.id)).toBeNull();
  expect(
    await prisma.objectDeletion.findUnique({ where: { key: media.objectKey } }),
  ).not.toBeNull();
  await expect(
    reactToDirectMessage(b, id, message.id, { emoji: "🔥" }),
  ).rejects.toThrow("not found");
});

test("pagination and change catch-up preserve equal timestamps, including reactions on an old page", async () => {
  const { id } = await startDirectConversation(b, c);
  const first = await sendDirectMessage(b, id, input("first"));
  // Seed a long history with real sequence/revision contracts, without 110 round trips.
  await prisma.directMessage.createMany({
    data: Array.from({ length: 110 }, (_, index) => ({
      conversationId: id,
      senderId: b,
      recipientId: c,
      clientId: randomUUID(),
      sequence: index + 2,
      revision: index + 2,
      body: `message ${index + 2}`,
      createdAt: new Date("2026-10-14T20:00:00Z"),
    })),
  });
  await prisma.directConversation.update({
    where: { id },
    data: { sequence: 111, revision: 111 },
  });
  const latest = await directThread(c, id);
  expect(latest.messages.length).toBe(50);
  expect(latest.hasMore).toBe(true);
  const older = await directThread(c, id, {
    before: latest.messages[0].sequence,
  });
  const oldest = await directThread(c, id, {
    before: older.messages[0].sequence,
  });
  expect(
    new Set(
      [...latest.messages, ...older.messages, ...oldest.messages].map(
        (m) => m.id,
      ),
    ).size,
  ).toBe(111);
  const changes = await directThread(c, id, { sinceRevision: 1 });
  expect(changes.moreChanges).toBe(true);
  expect(changes.revision).toBe(101);
  const rest = await directThread(c, id, { sinceRevision: changes.revision });
  expect(rest.messages.length).toBe(10);
  expect(rest.moreChanges).toBe(false);
  await reactToDirectMessage(c, id, first.id, { emoji: "😂" });
  const oldReaction = await directThread(b, id, { sinceRevision: 111 });
  expect(oldReaction.messages[0].id).toBe(first.id);
  expect(oldReaction.messages[0].reactions).toEqual([
    { userId: c, emoji: "😂" },
  ]);
});

test("DMs survive circle deletion and account deletion queues both senders' files", async () => {
  const { id } = await startDirectConversation(a, b);
  const fromA = await upload(a, id);
  const fromB = await upload(b, id);
  await sendDirectMessage(a, id, input("", [fromA.id]));
  await sendDirectMessage(b, id, input("", [fromB.id]));
  await changeCircleLifecycle(a, circle, "delete", circle);
  expect((await directThread(a, id)).messages.length).toBeGreaterThan(0);
  expect((await authorizedMedia(headers(b), fromA.id))?.id).toBe(fromA.id);
  const session = await prisma.session.create({
    data: {
      id: "dm-delete-session",
      userId: b,
      token: "dm-delete-token",
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await deleteOwnAccount(b, session.id, "DELETE");
  expect(
    await prisma.directConversation.findUnique({ where: { id } }),
  ).toBeNull();
  for (const file of [fromA, fromB]) {
    expect(
      await prisma.mediaUpload.findUnique({ where: { id: file.id } }),
    ).toBeNull();
    expect(
      await prisma.objectDeletion.findUnique({
        where: { key: file.objectKey },
      }),
    ).not.toBeNull();
  }
});
