import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { NextResponse } from "next/server";
import { EMPTY_ROUTINE } from "@/lib/timeblock-routine";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "").hostname !== "127.0.0.1"
)
  throw new Error("Run against the disposable test:social:ui database.");
mock.module("server-only", () => ({}));
const background: Promise<unknown>[] = [];
mock.module("next/server", () => ({
  NextResponse,
  after: (callback: () => Promise<unknown>) => {
    background.push(callback());
  },
}));
const owner = `chat-test-${randomUUID()}`;
const other = `chat-other-${randomUUID()}`;
mock.module("@/lib/request", () => ({
  hasSameOrigin: (request: Request) =>
    request.headers.get("origin") === new URL(request.url).origin,
  getRequestMembership: async (headers: Headers) =>
    headers.get("x-test-user")
      ? {
          session: { user: { id: headers.get("x-test-user") } },
          membership: { circleId: "test-circle" },
        }
      : null,
}));
const languageModel = new MockLanguageModelV4({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 35,
      chunks: [
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Your " },
        { type: "text-delta", id: "t", delta: "saved answer." },
        { type: "text-end", id: "t" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
        },
      ],
    }),
  }),
});
mock.module("@/lib/ai", () => ({ model: () => languageModel }));
process.env.OPENROUTER_API_KEY = "test-only-not-sent";
const { getPrisma } = await import("@/lib/prisma");
const { GET, POST, PATCH } = await import("@/app/api/timeblocks/chat/route");
const { POST: upload } = await import("@/app/api/timeblocks/chat/files/route");
const { GET: download } = await import(
  "@/app/api/timeblocks/chat/files/[id]/route"
);
const db = getPrisma();
const origin = "http://localhost:3317";
function request(method = "GET", body?: unknown, user = owner) {
  return new Request(`${origin}/api/timeblocks/chat`, {
    method,
    headers: {
      origin,
      "x-test-user": user,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function snapshot(user = owner) {
  return (await GET(request("GET", undefined, user))).json();
}
function input(
  chat: { id: string; revision: number },
  text = "Help plan my week",
) {
  return {
    id: chat.id,
    revision: chat.revision,
    dueMonday: "2026-09-21",
    rows: [],
    routine: EMPTY_ROUTINE,
    message: {
      id: randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    },
  };
}
async function settled() {
  await Promise.all(background.splice(0));
}
async function reset() {
  const chat = await snapshot();
  return (
    await PATCH(request("PATCH", { id: chat.id, action: "reset" }))
  ).json();
}
beforeAll(async () => {
  await db.user.createMany({
    data: [owner, other].map((id) => ({
      id,
      email: `${id}@example.invalid`,
      name: "Chat test",
    })),
  });
});
afterAll(async () => {
  await settled();
  await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
  await db.$disconnect();
});

test("authenticated history is private, and refresh after a browser disconnect retains the full reply", async () => {
  expect((await GET(request("GET", undefined, ""))).status).toBe(401);
  const chat = await snapshot();
  const response = await POST(request("POST", input(chat)));
  expect(response.status).toBe(200);
  if (!response.body) throw new Error("Expected a response stream");
  const reader = response.body.getReader();
  await reader.read();
  void reader.cancel();
  await settled();
  const restored = await snapshot();
  expect(restored.id).toBe(chat.id);
  expect(restored.running).toBe(false);
  expect(restored.messages).toHaveLength(2);
  expect(restored.messages[1].parts).toContainEqual({
    type: "text",
    text: "Your saved answer.",
    state: "done",
  });
  expect((await snapshot(other)).messages).toEqual([]);
});

test("concurrent sends reserve only one run and reject a stale client revision", async () => {
  const chat = await reset();
  const responses = await Promise.all([
    POST(request("POST", input(chat, "one"))),
    POST(request("POST", input(chat, "two"))),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  await Promise.all(responses.filter((r) => r.ok).map((r) => r.text()));
  await settled();
  expect((await snapshot()).messages).toHaveLength(2);
  expect((await POST(request("POST", input(chat)))).status).toBe(409);
});

test("New chat cannot be repopulated by a late response", async () => {
  const chat = await reset();
  const response = await POST(request("POST", input(chat)));
  const next = await reset();
  expect(next.id).not.toBe(chat.id);
  await response.text();
  await settled();
  const restored = await snapshot();
  expect(restored.id).toBe(next.id);
  expect(restored.messages).toEqual([]);
});

test("Stop freezes saved history and retry replaces the last answer without duplicating the user turn", async () => {
  const chat = await reset();
  const body = input(chat);
  const response = await POST(request("POST", body));
  const stopped = await PATCH(
    request("PATCH", { id: chat.id, action: "stop" }),
  );
  expect(stopped.status).toBe(200);
  const frozen = await snapshot();
  expect(frozen.running).toBe(false);
  await response.text();
  await settled();
  expect((await snapshot()).messages).toEqual(frozen.messages);
  const retry = await POST(
    request("POST", {
      ...body,
      revision: frozen.revision,
      trigger: "regenerate-message",
    }),
  );
  expect(retry.status).toBe(200);
  await retry.text();
  await settled();
  expect((await snapshot()).messages).toHaveLength(2);
});

test("expired runs release the conversation and preserve existing messages", async () => {
  const chat = await snapshot();
  await db.timeblockChat.update({
    where: { id: chat.id },
    data: { runId: "expired", runExpiresAt: new Date(0) },
  });
  const restored = await snapshot();
  expect(restored.running).toBe(false);
  expect(restored.messages).toEqual(chat.messages);
  expect(restored.error).toContain("interrupted");
});

test("private text uploads reach model context and cannot be downloaded or injected by another user", async () => {
  const chat = await reset();
  const contents = "Physics club meets Tuesday at 4 PM.";
  const ticketResponse = await upload(
    request("POST", {
      chatId: chat.id,
      filename: "schedule.txt",
      mediaType: "text/plain",
      sizeBytes: Buffer.byteLength(contents),
    }),
  );
  expect(ticketResponse.status).toBe(200);
  const ticket = await ticketResponse.json();
  const uploaded = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: contents,
  });
  expect(uploaded.ok).toBe(true);
  const fileId = ticket.part.url.split("/").at(-1);
  expect(
    (
      await download(request("GET", undefined, other), {
        params: Promise.resolve({ id: fileId }),
      })
    ).status,
  ).toBe(404);
  const body = input(chat);
  const response = await POST(
    request("POST", {
      ...body,
      message: { ...body.message, parts: [ticket.part] },
    }),
  );
  expect(response.status).toBe(200);
  await response.text();
  await settled();
  expect(JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt)).toContain(
    contents,
  );
  expect((await snapshot()).messages[0].parts[0]).toMatchObject(ticket.part);
  const foreign = input(await snapshot(other));
  expect(
    (
      await POST(
        request(
          "POST",
          { ...foreign, message: { ...foreign.message, parts: [ticket.part] } },
          other,
        ),
      )
    ).status,
  ).toBe(400);
});
