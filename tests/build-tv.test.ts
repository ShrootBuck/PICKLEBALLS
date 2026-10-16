import { expect, test } from "bun:test";
import { createBuildTVReader } from "../lib/build-tv-reader";

const config = {
  apiUrl: "http://coolify.internal/api/v1",
  token: "private-read-token",
  webUuid: "web-app",
  workerUuid: "worker-app",
};
const start = Date.parse("2026-10-15T12:00:00Z");
const deployment = (
  id: string,
  app: number,
  status = "queued",
  extra = {},
) => ({
  deployment_uuid: id,
  application_id: app,
  status,
  pull_request_id: 0,
  commit: "a".repeat(40),
  created_at: "2026-10-15T11:00:00Z",
  logs: "TOP_SECRET_LOGS",
  commit_message: "Show commit subjects in Build TV\n\nPRIVATE_BODY",
  server_name: "PRIVATE_SERVER",
  configuration_snapshot: { password: "TOP_SECRET" },
  ...extra,
});

function fixture(queue: unknown = []) {
  let time = start;
  let failure = false;
  let malformed = false;
  let calls = 0;
  const read = createBuildTVReader({
    config,
    now: () => time,
    fetcher: (async (input, init) => {
      calls++;
      expect(init?.headers).toEqual({
        Authorization: "Bearer private-read-token",
        Accept: "application/json",
      });
      expect(init?.redirect).toBe("error");
      if (failure)
        return new Response("PRIVATE_UPSTREAM_ERROR", { status: 500 });
      if (malformed) return Response.json({ message: "bad shape" });
      const url = new URL(String(input));
      expect(url.origin).toBe("http://coolify.internal");
      if (url.pathname === "/api/v1/deployments") return Response.json(queue);
      const app = url.pathname.includes("web-app") ? 12 : 13;
      return Response.json({
        count: 20000,
        deployments: [
          deployment(`latest-${app}`, app, app === 12 ? "failed" : "finished"),
        ],
      });
    }) as typeof fetch,
  });
  return {
    read,
    calls: () => calls,
    advance: (ms: number) => {
      time += ms;
    },
    fail: () => {
      failure = true;
    },
    recover: () => {
      failure = false;
    },
    malform: () => {
      malformed = true;
    },
  };
}

test("counts the full production queue, ignores other apps/previews, and strips private fields", async () => {
  const queued = Array.from({ length: 20_000 }, (_, index) =>
    deployment(`q-${index}`, 12),
  );
  const f = fixture([
    ...queued,
    queued[0],
    deployment("active", 13, "in_progress"),
    deployment("other", 999),
    deployment("preview", 12, "queued", { pull_request_id: 42 }),
  ]);
  const result = await f.read();
  expect(result.connection).toBe("connected");
  expect(result.snapshot).toMatchObject({ queued: 20_000, running: 1 });
  expect(result.snapshot?.services[0]).toMatchObject({
    key: "web",
    queued: 20_000,
    running: 0,
    latest: {
      status: "failed",
      commit: "aaaaaaa",
      commitMessage: "Show commit subjects in Build TV",
    },
  });
  const json = JSON.stringify(result);
  expect(json).not.toMatch(
    /SECRET|PRIVATE|private-read-token|internal|application_id|configuration|logs|commit_message/,
  );
  expect(json.length).toBeLessThan(1000);
});

test("coalesces simultaneous viewers and caches failures as well as success", async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 20 }, () => f.read()));
  expect(f.calls()).toBe(3);
  await f.read();
  expect(f.calls()).toBe(3);
  f.advance(10_001);
  f.fail();
  expect((await f.read()).connection).toBe("reconnecting");
  expect(f.calls()).toBe(6);
  await Promise.all([f.read(), f.read()]);
  expect(f.calls()).toBe(6);
});

test("failed upstream preserves briefly stale counts, expires them, and recovers", async () => {
  const f = fixture([deployment("queued", 12)]);
  const first = await f.read();
  f.advance(10_001);
  f.fail();
  const stale = await f.read();
  expect(stale).toEqual({
    connection: "reconnecting",
    snapshot: first.snapshot,
  });
  f.advance(120_000);
  expect(await f.read()).toEqual({ connection: "offline", snapshot: null });
  f.recover();
  f.advance(10_001);
  expect((await f.read()).connection).toBe("connected");
});

test("malformed responses and missing configuration never appear as an empty queue", async () => {
  const f = fixture();
  f.malform();
  expect(await f.read()).toEqual({ connection: "offline", snapshot: null });
  expect(await createBuildTVReader({ config: null })()).toEqual({
    connection: "unconfigured",
    snapshot: null,
  });
});

test("accepts Laravel's keyed queue collections and rejects unknown states", async () => {
  const result = await fixture({
    7: deployment("queued", 12),
    2: deployment("building", 13, "in_progress"),
  }).read();
  expect(result.snapshot).toMatchObject({ queued: 1, running: 1 });
  expect(
    (await fixture([deployment("new-state", 12, "surprise")]).read())
      .connection,
  ).toBe("offline");
});

test("invalid configuration does not send credentials", async () => {
  for (const invalid of [
    { apiUrl: "file:///etc" },
    { apiUrl: "https://user:pass@example.com/api/v1" },
    { webUuid: "../other" },
    { workerUuid: "web-app" },
  ]) {
    let called = false;
    const read = createBuildTVReader({
      config: { ...config, ...invalid },
      fetcher: (async (_input: string | URL | Request) => {
        called = true;
        return new Response("Should not fetch", { status: 500 });
      }) as typeof fetch,
    });
    expect((await read()).connection).toBe("offline");
    expect(called).toBe(false);
  }
});

test("commit subjects tolerate missing values and omit bodies with bounded length", async () => {
  for (const [message, expected] of [
    [undefined, null],
    [null, null],
    ["   ", null],
    ["  Fix deployment status\r\n\r\nPrivate details", "Fix deployment status"],
    ["x".repeat(500), "x".repeat(300)],
  ] as const) {
    const read = createBuildTVReader({
      config,
      fetcher: (async (input) =>
        String(input).endsWith("/deployments")
          ? Response.json([])
          : Response.json({
              deployments: [
                deployment("latest", 12, "finished", {
                  commit_message: message,
                }),
              ],
            })) as typeof fetch,
    });
    expect((await read()).snapshot?.services[0].latest?.commitMessage).toBe(
      expected,
    );
  }
});
