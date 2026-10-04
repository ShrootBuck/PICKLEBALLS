import { afterEach, expect, test } from "bun:test";
import { waitForScreenTimeRead } from "../lib/screen-time-read-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function responses(...items: (Response | Error)[]) {
  let calls = 0;
  globalThis.fetch = Object.assign(
    async () => {
      const item = items[calls++];
      if (item instanceof Error) throw item;
      if (!item) throw new Error("Unexpected request");
      return item;
    },
    { preconnect: originalFetch.preconnect },
  );
  return () => calls;
}

test("follows a pending read through completion without user input", async () => {
  const calls = responses(
    Response.json({ pending: true }),
    Response.json({ pending: true }),
    Response.json({ reading: { dailyAverageMinutes: 90 } }),
  );
  const result = await waitForScreenTimeRead(
    "run",
    new AbortController().signal,
    () => {},
    1,
  );
  expect(result).toEqual({ reading: { dailyAverageMinutes: 90 } });
  expect(calls()).toBe(3);
});

test("recovers from network errors, server errors and rate limits", async () => {
  responses(
    new TypeError("offline"),
    new Response("unavailable", { status: 503 }),
    new Response("slow down", { status: 429 }),
    Response.json({ reading: { dailyAverageMinutes: 42 } }),
  );
  const connection: boolean[] = [];
  const result = await waitForScreenTimeRead(
    "run",
    new AbortController().signal,
    (value) => connection.push(value),
    1,
  );
  expect(result).toEqual({ reading: { dailyAverageMinutes: 42 } });
  expect(connection).toEqual([true, true, true, false]);
});

test("surfaces validation failure and stops polling", async () => {
  const calls = responses(
    Response.json({ error: "Use last week's screenshot." }),
  );
  expect(
    await waitForScreenTimeRead(
      "run",
      new AbortController().signal,
      () => {},
      1,
    ),
  ).toEqual({ error: "Use last week's screenshot." });
  expect(calls()).toBe(1);
});

test("surfaces expired authentication rather than retrying forever", async () => {
  responses(Response.json({ error: "Sign in first." }, { status: 401 }));
  expect(
    await waitForScreenTimeRead(
      "run",
      new AbortController().signal,
      () => {},
      1,
    ),
  ).toEqual({ error: "Sign in first." });
});

test("navigation aborts the wait without sending another request", async () => {
  const calls = responses(Response.json({ pending: true }));
  const controller = new AbortController();
  const result = waitForScreenTimeRead(
    "run",
    controller.signal,
    () => {
      setTimeout(() => controller.abort(), 1);
    },
    100,
  );
  await expect(result).rejects.toBeDefined();
  expect(calls()).toBe(1);
});
