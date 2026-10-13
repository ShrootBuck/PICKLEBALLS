import { expect, test } from "bun:test";
import {
  notifyDeployment,
  verifyDeployment,
} from "../lib/deployment-verification";

const commit = "a".repeat(40);
const webhook = "https://discord.com/api/webhooks/123/test-token";

function harness(
  change?: (path: string, time: number) => Response | undefined,
) {
  let time = 0;
  const controller = new AbortController();
  const fetcher = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    const override = change?.(path, time);
    if (override) return override;
    if (path === "/api/health")
      return Response.json(
        {
          status: "ok",
          deployment: commit,
          worker: { status: "ok", deployment: commit },
        },
        { headers: { "cache-control": "no-store" } },
      );
    if (path === "/sign-in")
      return new Response(
        `<html data-dpl-id="${commit}"><script src="/_next/static/app.js?dpl=${commit}"></script><link href="/_next/static/app.css"></html>`,
      );
    return new Response("asset", {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    });
  }) as typeof fetch;
  return {
    controller,
    run: (overrides: Partial<Parameters<typeof verifyDeployment>[0]> = {}) =>
      verifyDeployment({
        origin: "https://pickle-balls.com",
        commit,
        signal: controller.signal,
        startedAt: 0,
        timeoutMs: 180_000,
        now: () => time,
        wait: async (ms) => {
          time += ms;
        },
        fetcher,
        ...overrides,
      }),
  };
}

test("a complete release must remain healthy for 60 seconds", async () => {
  const result = await harness().run();
  expect(result).toMatchObject({
    status: "verified",
    commit,
    assets: 2,
    elapsedSeconds: 60,
  });
});

test("mixed web/worker releases never pass", async () => {
  const result = await harness((path) =>
    path === "/api/health"
      ? Response.json({
          status: "ok",
          deployment: commit,
          worker: { status: "ok", deployment: "b".repeat(40) },
        })
      : undefined,
  ).run();
  expect(result.status).toBe("failed");
  expect(result.reason).toContain("expected commit");
});

test("stale pages and invalid assets fail verification", async () => {
  const cases = [
    {
      path: "/sign-in",
      response: () => new Response('<html data-dpl-id="old">'),
    },
    {
      path: "/_next/static/app.js",
      response: () =>
        new Response("html", {
          headers: {
            "content-type": "text/html",
            "cache-control": "immutable",
          },
        }),
    },
    {
      path: "/_next/static/app.js",
      response: () =>
        new Response("", { headers: { "cache-control": "immutable" } }),
    },
    { path: "/_next/static/app.js", response: () => new Response("asset") },
    {
      path: "/_next/static/app.js",
      response: () => new Response("missing", { status: 404 }),
    },
  ];
  for (const item of cases) {
    expect(
      (
        await harness((path) =>
          path === item.path ? item.response() : undefined,
        ).run()
      ).status,
    ).toBe("failed");
  }
});

test("a transient failure resets the observation period", async () => {
  const result = await harness((path, time) =>
    path === "/api/health" && time === 30_000
      ? new Response("unavailable", { status: 503 })
      : undefined,
  ).run();
  expect(result.status).toBe("verified");
  expect(result.elapsedSeconds).toBe(95);
});

test("shutdown aborts verification, while network failures are sanitized", async () => {
  const h = harness();
  h.controller.abort();
  expect(h.run()).rejects.toThrow();
  const result = await harness(() => {
    throw new Error("private URL and credentials");
  }).run();
  expect(result.reason).toBe("A public release check could not complete.");
});

test("Discord receives one combined result without mentions", async () => {
  const result = await harness().run();
  let calls = 0;
  await notifyDeployment(webhook, result, new AbortController().signal, (async (
    input,
    init,
  ) => {
    calls++;
    expect(new URL(String(input)).searchParams.get("wait")).toBe("true");
    const body = JSON.parse(String(init?.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds[0].title).toBe("Pickle Balls release verified");
    expect(body.embeds[0].fields[0].value).toBe(commit);
    return Response.json({ id: "message" });
  }) as typeof fetch);
  expect(calls).toBe(1);
});

test("Discord transport errors cannot leak its secret webhook", async () => {
  const result = await harness().run();
  await expect(
    notifyDeployment(
      webhook,
      result,
      new AbortController().signal,
      (async () => {
        throw new Error(webhook);
      }) as unknown as typeof fetch,
    ),
  ).rejects.toThrow("Deployment notification request could not complete");
  await expect(
    notifyDeployment("not a URL", result, new AbortController().signal),
  ).rejects.toThrow("Invalid deployment Discord webhook configuration");
});
