import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { Client } from "pg";
import type NodeWebSocket from "ws";
import type { RealtimeFrame } from "@/lib/realtime-protocol";
import type { RealtimeEvent } from "@/lib/realtime-types";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error(
    "Run with bun run test:integration against disposable Postgres.",
  );
// Exercise the actual Node production library, not Bun's built-in ws shim.
const ws = createRequire(import.meta.url)(
  "../node_modules/ws/index.js",
) as typeof import("ws");
const WebSocket = ws.WebSocket;
mock.module("ws", () => ws);
mock.module("server-only", () => ({}));
mock.module("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        return id
          ? { user: { id }, session: { id: `rt-session-${id}` } }
          : null;
      },
    },
  },
}));
const { getPrisma } = await import("@/lib/prisma");
const { getRealtimeHub } = await import("@/lib/realtime-server");
const { createRealtimeWebSocketServer } = await import(
  "@/lib/realtime-websocket-server"
);
let server: Awaited<ReturnType<typeof createRealtimeWebSocketServer>>;
let socketUrl: string;
const clients: NodeWebSocket[] = [];
async function openSocket(userId: string) {
  const socket = new WebSocket(socketUrl, {
    headers: {
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3317",
      "x-test-user": userId,
    },
  });
  clients.push(socket);
  const frames: RealtimeFrame[] = [];
  socket.on("message", (data) => frames.push(JSON.parse(data.toString())));
  await until(() => frames.some((frame) => frame.type === "ready"));
  return { socket, frames };
}
const { POST: typing } = await import("@/app/api/messages/[id]/typing/route");
const { sendDirectMessage, directThread, directInbox, readDirectMessages } =
  await import("@/lib/direct-messages");
const db = getPrisma();
const hub = getRealtimeHub();
const writer = new Client({ connectionString: process.env.DATABASE_URL });
const a = "rt-a",
  b = "rt-b",
  outsider = "rt-outsider",
  circle = "rt-circle";
const events = new Map<string, RealtimeEvent[]>();
const unsubscribers: (() => void)[] = [];
async function until(predicate: () => boolean) {
  const end = Date.now() + 3000;
  while (!predicate() && Date.now() < end) await Bun.sleep(20);
  expect(predicate()).toBe(true);
}
function clear() {
  for (const list of events.values()) list.length = 0;
}
beforeAll(async () => {
  await db.user.createMany({
    data: [a, b, outsider].map((id) => ({
      id,
      name: id,
      email: `${id}@example.invalid`,
    })),
  });
  await db.circle.create({
    data: { id: circle, name: "Realtime", slug: circle },
  });
  await db.membership.createMany({
    data: [a, b].map((userId) => ({ userId, circleId: circle })),
  });
  await db.session.createMany({
    data: [a, b, outsider].map((userId) => ({
      id: `rt-session-${userId}`,
      userId,
      token: `rt-token-${userId}`,
      expiresAt: new Date(Date.now() + 3600_000),
    })),
  });
  server = await createRealtimeWebSocketServer(0);
  const address = server.server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  socketUrl = `ws://127.0.0.1:${address.port}/api/realtime`;
  await writer.connect();
  for (const user of [a, b, outsider]) {
    const list: RealtimeEvent[] = [];
    events.set(user, list);
    unsubscribers.push(hub.subscribe(user, (event) => list.push(event)));
  }
  await until(() =>
    [...events.values()].every((list) =>
      list.some((event) => event.type === "ready"),
    ),
  );
  clear();
});
afterAll(async () => {
  for (const client of clients) client.terminate();
  await server?.close();
  for (const unsubscribe of unsubscribers) unsubscribe();
  await hub.close();
  await writer.end();
  await db.$disconnect();
});

test("only committed changes reach current circle members, including changes from a separate worker connection", async () => {
  clear();
  await writer.query("BEGIN");
  await writer.query('UPDATE "Circle" SET name = $1 WHERE id = $2', [
    "Rolled back",
    circle,
  ]);
  await Bun.sleep(120);
  expect(events.get(a)).toEqual([]);
  await writer.query("ROLLBACK");
  await Bun.sleep(120);
  expect(events.get(a)).toEqual([]);
  await writer.query('UPDATE "Circle" SET name = $1 WHERE id = $2', [
    "Committed",
    circle,
  ]);
  await until(() =>
    (events.get(a) ?? []).some((event) => event.type === "refresh"),
  );
  expect(events.get(b)).toContainEqual({ type: "refresh", circleId: circle });
  expect(events.get(outsider)).toEqual([]);
});

test("private streaks and processing updates stay owner-scoped", async () => {
  clear();
  await db.streak.create({
    data: {
      id: "rt-private",
      userId: a,
      circleId: circle,
      title: "Private",
      kind: "BUILD",
      visibility: "PRIVATE",
    },
  });
  await db.mediaUpload.create({
    data: {
      id: `i_${randomUUID()}`,
      ownerId: a,
      circleId: circle,
      mimeType: "image/png",
      sizeBytes: 32,
      objectKey: `rt/${randomUUID()}`,
    },
  });
  await until(() =>
    (events.get(a) ?? []).some((event) => event.type === "media"),
  );
  expect(events.get(a)).toContainEqual({ type: "refresh" });
  expect(events.get(b)).toEqual([]);
  expect(events.get(outsider)).toEqual([]);
});

test("DMs, typing and read receipts reach exactly the two participants", async () => {
  const conversation = (await directInbox(a, circle)).find(
    (chat) => chat.person?.id === b,
  );
  if (!conversation) throw new Error("Missing direct conversation");
  await Bun.sleep(100);
  clear();
  const message = await sendDirectMessage(a, conversation.id, {
    body: "Instant",
    clientId: randomUUID(),
    mediaIds: [],
  });
  await until(() =>
    (events.get(b) ?? []).some((event) => event.type === "messages"),
  );
  expect(events.get(a)).toContainEqual({
    type: "messages",
    conversationId: conversation.id,
  });
  expect(events.get(outsider)).toEqual([]);
  clear();
  const request = (user: string, origin = "http://localhost") =>
    new Request("http://localhost/api/messages/typing", {
      method: "POST",
      headers: {
        "x-test-user": user,
        origin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ active: true, clientId: randomUUID() }),
    });
  const context = { params: Promise.resolve({ id: conversation.id }) };
  expect((await typing(request(outsider), context)).status).toBe(404);
  expect(
    (await typing(request(a, "https://attacker.invalid"), context)).status,
  ).toBe(403);
  expect((await typing(request(a), context)).status).toBe(200);
  await until(() =>
    (events.get(b) ?? []).some((event) => event.type === "typing"),
  );
  expect(events.get(a)).toEqual([]);
  expect(events.get(outsider)).toEqual([]);
  clear();
  await readDirectMessages(b, conversation.id, message.sequence);
  await until(() =>
    (events.get(a) ?? []).some((event) => event.type === "messages"),
  );
  expect(
    (
      await directThread(a, conversation.id, {
        sinceRevision: message.revision,
      })
    ).readThrough,
  ).toBe(message.sequence);
});

test("group messages and typing reach current members, and group reads only refresh the reader", async () => {
  const group = (await directInbox(a, circle)).find(
    (chat) => chat.kind === "group",
  );
  if (!group) throw new Error("Missing group conversation");
  await Bun.sleep(100);
  clear();
  const message = await sendDirectMessage(a, group.id, {
    body: "Circle hello",
    clientId: randomUUID(),
  });
  await until(() =>
    (events.get(b) ?? []).some(
      (event) => event.type === "messages" && event.conversationId === group.id,
    ),
  );
  expect(events.get(outsider)).toEqual([]);
  await Bun.sleep(100);
  clear();
  const response = await typing(
    new Request("http://localhost/api/messages/typing", {
      method: "POST",
      headers: {
        "x-test-user": a,
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({ active: true, clientId: randomUUID() }),
    }),
    { params: Promise.resolve({ id: group.id }) },
  );
  expect(response.status).toBe(200);
  await until(() =>
    (events.get(b) ?? []).some((event) => event.type === "typing"),
  );
  expect(events.get(outsider)).toEqual([]);
  clear();
  await readDirectMessages(b, group.id, message.sequence);
  await until(() =>
    (events.get(b) ?? []).some((event) => event.type === "messages"),
  );
  expect(events.get(a)).toEqual([]);
  expect(events.get(outsider)).toEqual([]);
});

test("membership revocation refreshes the removed user but cuts off later circle events", async () => {
  clear();
  await db.membership.delete({
    where: { userId_circleId: { userId: b, circleId: circle } },
  });
  await until(() =>
    (events.get(b) ?? []).some((event) => event.type === "refresh"),
  );
  await Bun.sleep(100);
  clear();
  const group = (await directInbox(a, circle)).find(
    (chat) => chat.kind === "group",
  );
  if (!group) throw new Error("Missing group conversation");
  await sendDirectMessage(a, group.id, {
    body: "After removal",
    clientId: randomUUID(),
  });
  await writer.query('UPDATE "Circle" SET name = $1 WHERE id = $2', [
    "After removal",
    circle,
  ]);
  await until(() =>
    (events.get(a) ?? []).some((event) => event.type === "refresh"),
  );
  expect(events.get(b)).toEqual([]);
  expect(events.get(outsider)).toEqual([]);
});

test("WebSocket upgrades reject missing auth and cross-origin connections", async () => {
  async function rejected(headers: Record<string, string>) {
    return new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(socketUrl, { headers });
      socket.on("unexpected-response", (_request, response) => {
        response.resume();
        socket.terminate();
        resolve(response.statusCode ?? 0);
      });
      socket.on("open", () => {
        socket.terminate();
        reject(new Error("Unexpected upgrade"));
      });
      socket.on("error", () => {});
    });
  }
  expect(
    await rejected({
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3317",
    }),
  ).toBe(401);
  expect(
    await rejected({ origin: "https://attacker.invalid", "x-test-user": a }),
  ).toBe(403);
  expect(await rejected({ "x-test-user": a })).toBe(403);
});

test("subscribed messages and receipts are pushed, and unauthorized subscriptions reveal nothing", async () => {
  const { socket, frames } = await openSocket(a);
  const conversation = await db.directConversation.findFirstOrThrow({
    where: { userAId: a, userBId: b },
  });
  const subscriptionId = randomUUID();
  socket.send(
    JSON.stringify({
      type: "watch-thread",
      subscriptionId,
      conversationId: conversation.id,
    }),
  );
  await until(() => frames.some((frame) => frame.type === "thread"));
  frames.length = 0;
  const message = await sendDirectMessage(a, conversation.id, {
    clientId: randomUUID(),
    body: "Pushed through WebSocket",
  });
  await until(() =>
    frames.some(
      (frame) =>
        frame.type === "thread" &&
        frame.thread.messages.some((row) => row.id === message.id),
    ),
  );
  const peer = await openSocket(b);
  const requestId = randomUUID();
  peer.socket.send(
    JSON.stringify({
      type: "read",
      requestId,
      conversationId: conversation.id,
      through: message.sequence,
    }),
  );
  await until(() =>
    peer.frames.some(
      (frame) => frame.type === "result" && frame.requestId === requestId,
    ),
  );
  await until(() =>
    frames.some(
      (frame) =>
        frame.type === "thread" &&
        frame.thread.readThrough === message.sequence,
    ),
  );
  const stranger = await openSocket(outsider);
  stranger.socket.send(
    JSON.stringify({
      type: "watch-thread",
      subscriptionId,
      conversationId: conversation.id,
    }),
  );
  await until(() =>
    stranger.frames.some(
      (frame) => frame.type === "error" && frame.status === 404,
    ),
  );
  expect(stranger.frames.some((frame) => frame.type === "thread")).toBe(false);
  socket.send(JSON.stringify({ type: "unwatch-thread", subscriptionId }));
  await Bun.sleep(100);
  frames.length = 0;
  await sendDirectMessage(a, conversation.id, {
    clientId: randomUUID(),
    body: "After unsubscribe",
  });
  await Bun.sleep(200);
  expect(frames.some((frame) => frame.type === "thread")).toBe(false);
  socket.terminate();
  peer.socket.terminate();
  stranger.socket.terminate();
});

test("typing uses ordered socket frames and still enforces conversation access", async () => {
  const { socket } = await openSocket(a);
  const peer = await openSocket(b);
  const conversation = await db.directConversation.findFirstOrThrow({
    where: { userAId: a, userBId: b },
  });
  const clientId = randomUUID();
  for (const active of [true, false])
    socket.send(
      JSON.stringify({
        type: "typing",
        conversationId: conversation.id,
        clientId,
        active,
      }),
    );
  await until(
    () =>
      peer.frames.filter(
        (frame) => frame.type === "typing" && frame.clientId === clientId,
      ).length === 2,
  );
  expect(
    peer.frames
      .filter((frame) => frame.type === "typing")
      .map((frame) => frame.type === "typing" && frame.active),
  ).toEqual([true, false]);
  const stranger = await openSocket(outsider);
  stranger.socket.send(
    JSON.stringify({
      type: "typing",
      conversationId: conversation.id,
      clientId: randomUUID(),
      active: true,
    }),
  );
  await until(() =>
    stranger.frames.some(
      (frame) => frame.type === "error" && frame.status === 404,
    ),
  );
  socket.terminate();
  peer.socket.terminate();
  stranger.socket.terminate();
});

test("resubscribing drains more than one page of missed message revisions", async () => {
  const conversation = await db.directConversation.findFirstOrThrow({
    where: { userAId: a, userBId: b },
  });
  const sent = new Set<string>();
  for (let index = 0; index < 105; index++) {
    const message = await sendDirectMessage(a, conversation.id, {
      clientId: randomUUID(),
      body: `Missed update ${index}`,
    });
    sent.add(message.id);
  }
  const { socket, frames } = await openSocket(a);
  socket.send(
    JSON.stringify({
      type: "watch-thread",
      subscriptionId: randomUUID(),
      conversationId: conversation.id,
      sinceRevision: conversation.revision,
    }),
  );
  const received = () =>
    frames.flatMap((frame) =>
      frame.type === "thread" ? frame.thread.messages : [],
    );
  await until(() =>
    [...sent].every((id) => received().some((message) => message.id === id)),
  );
  const pages = frames.filter((frame) => frame.type === "thread");
  expect(pages).toHaveLength(2);
  expect(pages[0].thread.moreChanges).toBe(true);
  expect(pages[1].thread.moreChanges).toBe(false);
  expect(new Set(received().map((message) => message.id)).size).toBe(105);
  socket.terminate();
}, 15_000);

test("removing circle membership stops an already subscribed group thread", async () => {
  await db.membership.create({ data: { userId: b, circleId: circle } });
  const group = (await directInbox(a, circle)).find(
    (chat) => chat.kind === "group",
  );
  if (!group) throw new Error("Missing group conversation");
  const { socket, frames } = await openSocket(b);
  socket.send(
    JSON.stringify({
      type: "watch-thread",
      subscriptionId: randomUUID(),
      conversationId: group.id,
    }),
  );
  await until(() => frames.some((frame) => frame.type === "thread"));
  await db.membership.delete({
    where: { userId_circleId: { userId: b, circleId: circle } },
  });
  await until(() =>
    frames.some((frame) => frame.type === "error" && frame.status === 404),
  );
  frames.length = 0;
  await sendDirectMessage(a, group.id, {
    clientId: randomUUID(),
    body: "Private after removal",
  });
  await Bun.sleep(200);
  expect(frames.some((frame) => frame.type === "thread")).toBe(false);
  socket.terminate();
});

test("revoking a session immediately closes its open socket", async () => {
  const { socket, frames } = await openSocket(b);
  await db.session.delete({ where: { id: `rt-session-${b}` } });
  await until(() => frames.some((frame) => frame.type === "signed-out"));
  await until(() => socket.readyState === WebSocket.CLOSED);
});

test("oversized or invalid commands close the socket instead of allocating unbounded work", async () => {
  for (const value of ['{"type":"arbitrary-command"}', "x".repeat(5000)]) {
    const { socket } = await openSocket(a);
    socket.send(value);
    await until(() => socket.readyState === WebSocket.CLOSED);
  }
});

test("a user cannot accumulate unlimited connections and released slots can reconnect", async () => {
  const slots: (() => void)[] = [];
  try {
    // One subscription for this user is already held by the test observer.
    for (let index = 0; index < 11; index++)
      slots.push(hub.subscribe(a, () => {}));
    const socket = new WebSocket(socketUrl, {
      headers: {
        origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3317",
        "x-test-user": a,
      },
    });
    clients.push(socket);
    await until(() => socket.readyState === WebSocket.CLOSED);
    slots.pop()?.();
    const allowed = await openSocket(a);
    allowed.socket.terminate();
  } finally {
    for (const unsubscribe of slots) unsubscribe();
  }
});

test("a database listener disconnect closes sockets and a new subscription gets a fresh ready signal", async () => {
  clear();
  await writer.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'pickleballs-realtime' AND datname = current_database()",
  );
  await until(() =>
    (events.get(a) ?? []).some((event) => event.type === "reconnect"),
  );
  const received: RealtimeEvent[] = [];
  const unsubscribe = hub.subscribe(a, (event) => received.push(event));
  await until(() => received.some((event) => event.type === "ready"));
  unsubscribe();
});
