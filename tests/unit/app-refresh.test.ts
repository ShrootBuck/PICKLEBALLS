import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
  activeMutations,
  appFetch,
  holdAppRefresh,
  refreshEvent,
} from "../../lib/app-refresh";
import { proofFetch } from "../../lib/proof-fetch";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let events: EventTarget;
let changes = 0;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

beforeEach(() => {
  events = new EventTarget();
  changes = 0;
  events.addEventListener(refreshEvent, () => changes++);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: events,
  });
  fetchSpy = spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (originalWindow)
    Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  expect(activeMutations()).toBe(0);
});

test("only successful writes invalidate; GETs and rejected writes do not", async () => {
  fetchSpy.mockResolvedValueOnce(Response.json({ value: 1 }));
  expect(await (await appFetch("/api/tasks")).json()).toEqual({ value: 1 });
  fetchSpy.mockResolvedValueOnce(
    Response.json({ error: "No" }, { status: 409 }),
  );
  expect((await appFetch("/api/tasks", { method: "POST" })).status).toBe(409);
  expect(changes).toBe(0);
  fetchSpy.mockResolvedValueOnce(Response.json({ value: 2 }, { status: 201 }));
  expect(
    await (await appFetch("/api/tasks", { method: "POST" })).json(),
  ).toEqual({ value: 2 });
  expect(changes).toBe(1);
});

test("nested upload holds release once and failed network writes release the hold", async () => {
  const outer = holdAppRefresh();
  const inner = holdAppRefresh();
  expect(activeMutations()).toBe(2);
  inner();
  inner();
  expect(activeMutations()).toBe(1);
  outer();
  fetchSpy.mockRejectedValueOnce(new TypeError("offline"));
  await expect(appFetch("/api/tasks", { method: "POST" })).rejects.toThrow(
    "offline",
  );
  expect(changes).toBe(0);
});

test("proof saves resolve before AI finishes and completion refreshes again", async () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  fetchSpy.mockResolvedValueOnce(
    new Response(stream, {
      status: 201,
      headers: { "content-type": "application/x-ndjson" },
    }),
  );
  const completed = Promise.withResolvers<void>();
  const request = proofFetch(
    "/api/proof",
    { method: "POST" },
    completed.resolve,
  );
  // Exercise chunk boundaries inside both JSON and multibyte UTF-8.
  const saved = encoder.encode(
    '{"type":"saved","data":{"proof":{"id":"p1","note":"🎾"}}}\n',
  );
  for (const byte of saved) controller.enqueue(new Uint8Array([byte]));
  const response = await request;
  expect(await response.json()).toEqual({ proof: { id: "p1", note: "🎾" } });
  expect(changes).toBe(1);
  expect(activeMutations()).toBe(0);
  controller.enqueue(encoder.encode('{"type":"complete"}\n'));
  controller.close();
  await completed.promise;
  expect(changes).toBe(2);
});

test("a broken AI stream does not undo an acknowledged proof", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  fetchSpy.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(value) {
          controller = value;
        },
      }),
      { status: 201, headers: { "content-type": "application/x-ndjson" } },
    ),
  );
  const completed = Promise.withResolvers<void>();
  const request = proofFetch(
    "/api/proof",
    { method: "POST" },
    completed.resolve,
  );
  controller.enqueue(
    new TextEncoder().encode('{"type":"saved","data":{"proof":{"id":"p1"}}}\n'),
  );
  const saved = await request;
  controller.error(new TypeError("connection lost"));
  await completed.promise;
  expect(saved.status).toBe(201);
  expect(await saved.json()).toEqual({ proof: { id: "p1" } });
  expect(changes).toBe(2);
});
