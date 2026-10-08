import { expect, test } from "bun:test";
import { workerRelease } from "../lib/release-status";

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
