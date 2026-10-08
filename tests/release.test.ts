import { expect, test } from "bun:test";
import { workerRelease } from "../lib/release-status";
import { matchesRelease, pageAssets } from "../scripts/ci/release";

test("web can become ready before worker, but completion requires both exact commits", () => {
  const release = {
    status: "ok",
    deployment: "new",
    worker: { status: "ok", deployment: "old" },
  };
  expect(matchesRelease(release, "new", false)).toBe(true);
  expect(matchesRelease(release, "new", true)).toBe(false);
  expect(
    matchesRelease(
      { ...release, worker: { status: "ok", deployment: "new" } },
      "new",
      true,
    ),
  ).toBe(true);
  expect(
    matchesRelease({ ...release, status: "unavailable" }, "new", false),
  ).toBe(false);
  expect(matchesRelease({ status: "ok" }, "new", false)).toBe(false);
});

test("asset snapshot rejects wrong pages and preserves deployment query parameters", () => {
  expect(() => pageAssets("<html>Login failed</html>")).toThrow();
  expect(
    pageAssets(
      '<html data-dpl-id="abc"><script src="/_next/static/chunk.js?dpl=abc&amp;x=1"></script></html>',
    ),
  ).toEqual({
    deployment: "abc",
    assets: ["/_next/static/chunk.js?dpl=abc&x=1"],
  });
});

test("worker status exposes only validated readiness and commit, never internal errors", async () => {
  let body: unknown = {
    status: "ok",
    deployment: "a".repeat(40),
    secret: "not-public",
  };
  const server = Bun.serve({ port: 0, fetch: () => Response.json(body) });
  try {
    expect(await workerRelease(server.url.href)).toEqual({
      status: "ok",
      deployment: "a".repeat(40),
    });
    body = { status: "ok", deployment: "internal-hostname" };
    expect(await workerRelease(server.url.href)).toBeNull();
    body = { status: "unavailable", deployment: "a".repeat(40) };
    expect(await workerRelease(server.url.href)).toBeNull();
    expect(await workerRelease(undefined)).toBeNull();
  } finally {
    server.stop(true);
  }
});
