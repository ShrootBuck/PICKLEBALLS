import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { RealtimeEvent } from "@/lib/realtime-types";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error(
    "Run with bun run test:integration against disposable Postgres.",
  );
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
const { GET } = await import("@/app/api/realtime/route");
const { POST: typing } = await import("@/app/api/messages/[id]/typing/route");
const {
  startDirectConversation,
  sendDirectMessage,
  directThread,
  readDirectMessages,
} = await import("@/lib/direct-messages");
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
    data: [a, b].map((userId) => ({
      id: `rt-session-${userId}`,
      userId,
      token: `rt-token-${userId}`,
      expiresAt: new Date(Date.now() + 3600_000),
    })),
  });
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
  const conversation = await startDirectConversation(a, b);
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

test("the SSE route authenticates, streams without buffering, and releases subscriptions on abort", async () => {
  expect((await GET(new Request("http://localhost/api/realtime"))).status).toBe(
    401,
  );
  const controller = new AbortController();
  const response = await GET(
    new Request("http://localhost/api/realtime", {
      headers: { "x-test-user": a },
      signal: controller.signal,
    }),
  );
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(response.headers.get("cache-control")).toContain("no-transform");
  expect(response.headers.get("x-accel-buffering")).toBe("no");
  if (!response.body) throw new Error("Missing event stream");
  const reader = response.body.getReader();
  let text = "";
  while (!text.includes('"ready"'))
    text += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  let done = false;
  while (!done) done = (await reader.read()).done;
  expect(done).toBe(true);
});

test("revoking a session immediately closes its open stream", async () => {
  const response = await GET(
    new Request("http://localhost/api/realtime", {
      headers: { "x-test-user": b },
    }),
  );
  if (!response.body) throw new Error("Missing event stream");
  const reader = response.body.getReader();
  await db.session.delete({ where: { id: `rt-session-${b}` } });
  let text = "";
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    text += new TextDecoder().decode(result.value);
  }
  expect(text).toContain('"signed-out"');
});

test("a user cannot accumulate unlimited streams and released slots can reconnect", async () => {
  const slots: (() => void)[] = [];
  try {
    // One subscription for this user is already held by the test observer.
    for (let index = 0; index < 11; index++)
      slots.push(hub.subscribe(a, () => {}));
    const request = () =>
      new Request("http://localhost/api/realtime", {
        headers: { "x-test-user": a },
      });
    expect((await GET(request())).status).toBe(429);
    slots.pop()?.();
    const response = await GET(request());
    expect(response.status).toBe(200);
    await response.body?.cancel();
  } finally {
    for (const unsubscribe of slots) unsubscribe();
  }
});

test("a database listener disconnect closes streams and a new subscription gets a fresh ready signal", async () => {
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
