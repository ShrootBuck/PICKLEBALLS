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
async function directPair(userId: string, recipientId: string) {
  const chat = (await directInbox(userId, circle)).find(
    (item) => item.person?.id === recipientId,
  );
  if (!chat) throw new Error("Missing direct conversation in the directory");
  return { id: chat.id };
}
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

test("only current-circle contacts appear, with one conversation per pair under concurrent inbox loads", async () => {
  expect((await directContacts(b, circle)).map((p) => p.id).sort()).toEqual([
    a,
    c,
  ]);
  expect(
    (await directInbox(b, circle)).some(
      (chat) => chat.person?.id === b || chat.person?.id === stranger,
    ),
  ).toBe(false);
  const conversations = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      directPair(i % 2 ? b : a, i % 2 ? a : b),
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
  const { id } = await directPair(a, b);
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
  expect(await directUnreadCount(b, circle)).toBe(1);
  expect(
    (await directInbox(b, circle)).find((chat) => chat.id === id)?.unread,
  ).toBe(1);
  expect((await directInbox(c, circle)).map((chat) => chat.unread)).toEqual([
    0, 0, 0,
  ]);
});

test("another circle member cannot read, send, acknowledge, react, or delete in someone else's conversation", async () => {
  const { id } = await directPair(a, b);
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
  const ab = await directPair(a, b);
  const ac = await directPair(a, c);
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
  const { id } = await directPair(a, b);
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
  const { id } = await directPair(b, c);
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

test("the directory includes empty DMs alphabetically and one shared chat per current circle", async () => {
  const lists = await Promise.all([
    directInbox(a, circle),
    directInbox(b, circle),
    directInbox(a, circle),
  ]);
  expect(new Set(lists.map((list) => list[0].id)).size).toBe(1);
  expect(lists[0][0]).toMatchObject({ kind: "group", group: { id: circle } });
  expect(lists[0].slice(1).map((chat) => chat.person?.id)).toEqual([b, c]);
  const elsewhere = await directInbox(a, otherCircle);
  expect(elsewhere[0].id).not.toBe(lists[0][0].id);
  expect(elsewhere.slice(1).map((chat) => chat.person?.id)).toEqual([stranger]);
  expect(elsewhere[1].lastMessage).toBeNull();
  await expect(directInbox(b, otherCircle)).rejects.toThrow("not found");
  const newcomer = await prisma.user.create({
    data: { name: "Aaron", email: "dm-new@example.invalid" },
  });
  await prisma.membership.create({
    data: { userId: newcomer.id, circleId: circle },
  });
  const afterJoin = await directInbox(a, circle);
  expect(afterJoin[1].person?.id).toBe(newcomer.id);
  expect(afterJoin[1].lastMessage).toBeNull();
  await prisma.user.delete({ where: { id: newcomer.id } });
});

test("circle chat supports shared media and reactions with independent, monotonic read positions and membership gates", async () => {
  const { id } = (await directInbox(a, circle))[0];
  const photo = await upload(a, id);
  const first = await sendDirectMessage(
    a,
    id,
    input("For everyone", [photo.id]),
  );
  expect(first.sender?.id).toBe(a);
  const second = await sendDirectMessage(a, id, input("Next"));
  await sendDirectMessage(b, id, input("My own message"));
  expect((await directInbox(b, circle))[0].unread).toBe(2);
  expect((await directInbox(c, circle))[0].unread).toBe(3);
  await readDirectMessages(b, id, first.sequence);
  expect((await directInbox(b, circle))[0].unread).toBe(1);
  expect((await directInbox(c, circle))[0].unread).toBe(3);
  await readDirectMessages(b, id, second.sequence);
  await readDirectMessages(b, id, first.sequence);
  expect((await directInbox(b, circle))[0].unread).toBe(0);
  await readDirectMessages(b, id, 999999);
  await sendDirectMessage(a, id, input("Unseen arrival"));
  expect((await directInbox(b, circle))[0].unread).toBe(1);
  expect((await authorizedMedia(headers(c), photo.id))?.id).toBe(photo.id);
  expect(
    await authorizedMedia(headers(stranger, otherCircle), photo.id),
  ).toBeNull();
  for (const action of [
    () => directThread(stranger, id),
    () => sendDirectMessage(stranger, id, input()),
    () => readDirectMessages(stranger, id, 999),
    () => reactToDirectMessage(stranger, id, first.id, { emoji: "🔥" }),
    () => deleteDirectMessage(b, id, first.id),
  ])
    await expect(action()).rejects.toThrow("not found");
  await reactToDirectMessage(b, id, first.id, { emoji: "🔥" });
  const reacted = await reactToDirectMessage(c, id, first.id, { emoji: "🔥" });
  expect(reacted.reactions).toHaveLength(2);
  await prisma.membership.delete({
    where: { userId_circleId: { userId: c, circleId: circle } },
  });
  await expect(directThread(c, id)).rejects.toThrow("not found");
  expect(await authorizedMedia(headers(c), photo.id)).toBeNull();
  await prisma.membership.create({ data: { userId: c, circleId: circle } });
  await deleteDirectMessage(a, id, first.id);
  expect(await authorizedMedia(headers(c), photo.id)).toBeNull();
  expect(
    (await directThread(c, id, { sinceRevision: reacted.revision })).messages[0]
      .deletedAt,
  ).not.toBeNull();
});

test("circle and account deletion clean up group files without deleting unrelated conversations", async () => {
  const { id } = await directPair(a, b);
  const fromA = await upload(a, id);
  const fromB = await upload(b, id);
  await sendDirectMessage(a, id, input("", [fromA.id]));
  await sendDirectMessage(b, id, input("", [fromB.id]));
  const group = (await directInbox(a, circle))[0];
  const groupFile = await upload(a, group.id);
  await sendDirectMessage(a, group.id, input("", [groupFile.id]));
  await prisma.membership.create({
    data: { userId: b, circleId: otherCircle },
  });
  const otherGroup = (await directInbox(a, otherCircle))[0];
  const sharedFile = await upload(stranger, otherGroup.id);
  const shared = await sendDirectMessage(
    stranger,
    otherGroup.id,
    input("Keep this", [sharedFile.id]),
  );
  const departing = await sendDirectMessage(
    b,
    otherGroup.id,
    input("Erase this"),
  );
  await reactToDirectMessage(b, otherGroup.id, shared.id, { emoji: "🔥" });
  await changeCircleLifecycle(a, circle, "delete", circle);
  expect(
    await prisma.directConversation.findUnique({ where: { id: group.id } }),
  ).toBeNull();
  expect(
    await prisma.objectDeletion.findUnique({
      where: { key: groupFile.objectKey },
    }),
  ).not.toBeNull();
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
  const remaining = await directThread(a, otherGroup.id);
  expect(
    remaining.messages.find((message) => message.id === shared.id)?.body,
  ).toBe("Keep this");
  expect(
    remaining.messages.find((message) => message.id === departing.id),
  ).toMatchObject({ senderId: null, body: "" });
  expect(
    (
      await directThread(a, otherGroup.id, {
        sinceRevision: departing.revision,
      })
    ).messages.find((message) => message.id === departing.id)?.deletedAt,
  ).not.toBeNull();
  expect(
    await prisma.mediaUpload.findUnique({ where: { id: sharedFile.id } }),
  ).not.toBeNull();
  expect(
    remaining.messages.find((message) => message.id === shared.id)?.reactions,
  ).toEqual([]);
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
