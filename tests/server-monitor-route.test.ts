import { expect, mock, test } from "bun:test";

let signedIn = false;
let reads = 0;
mock.module("@/lib/request", () => ({
  getRequestMembership: async () =>
    signedIn ? { session: { user: { id: "member" } } } : null,
  hasSameOrigin: (request: Request) =>
    request.headers.get("origin") === "https://pickle-balls.com",
}));
mock.module("@/lib/server-monitor-server", () => ({
  readServerMonitor: async () => {
    reads++;
    return { connection: "unconfigured", snapshot: null };
  },
}));
const { GET } = await import("../app/api/server-monitor/route");

test("requires origin and membership before reading host metrics, with private responses", async () => {
  const request = (origin = "https://pickle-balls.com") =>
    new Request("https://pickle-balls.com/api/server-monitor", {
      headers: { origin },
    });
  const forbidden = await GET(request("https://other.example"));
  expect(forbidden.status).toBe(403);
  expect(forbidden.headers.get("cache-control")).toBe("private, no-store");
  expect((await GET(request())).status).toBe(401);
  expect(reads).toBe(0);
  signedIn = true;
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    connection: "unconfigured",
    snapshot: null,
  });
  expect(reads).toBe(1);
});
