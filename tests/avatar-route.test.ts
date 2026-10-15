import { afterEach, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
let signedIn = true;
let admin = false;
const user = { id: "friend", image: null, accounts: [] };
const findFirst = mock(
  async (_args: unknown): Promise<typeof user | null> => user,
);
const findUnique = mock(async (_args: unknown) => user);
const refreshDiscordAvatar = mock(
  async (_args: unknown): Promise<string | null> =>
    "https://cdn.discordapp.com/embed/avatars/2.png?size=128",
);
const limitAction = mock(async (..._args: unknown[]) => {});
mock.module("@/lib/request", () => ({
  getRequestMembership: async () =>
    signedIn ? { session: { user: { id: "viewer" } } } : null,
}));
mock.module("@/lib/super-admin", () => ({ isSuperAdmin: async () => admin }));
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({ user: { findFirst, findUnique } }),
}));
mock.module("@/lib/discord-avatar", () => ({ refreshDiscordAvatar }));
mock.module("@/lib/rate-limit", () => ({ limitAction }));
const { GET } = await import("@/app/api/avatar/route");
const originalFetch = globalThis.fetch;
const fetchMock = mock(
  async (_input: unknown, _init?: RequestInit) =>
    new Response("image-bytes", { headers: { "content-type": "image/png" } }),
);
const request = (query = "userId=friend") =>
  GET(new Request(`http://localhost/api/avatar?${query}`));
beforeEach(() => {
  signedIn = true;
  admin = false;
  findFirst.mockClear();
  findFirst.mockResolvedValue(user);
  findUnique.mockClear();
  refreshDiscordAvatar.mockClear();
  refreshDiscordAvatar.mockResolvedValue(
    "https://cdn.discordapp.com/embed/avatars/2.png?size=128",
  );
  limitAction.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response("image-bytes", { headers: { "content-type": "image/png" } }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("serves the refreshed image with short private caching", async () => {
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("image-bytes");
  expect(response.headers.get("cache-control")).toBe(
    "private, max-age=60, must-revalidate",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(fetchMock).toHaveBeenCalledWith(
    "https://cdn.discordapp.com/embed/avatars/2.png?size=128",
    expect.objectContaining({ cache: "no-store", redirect: "error" }),
  );
  expect(findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: "friend",
        OR: [
          { id: "viewer" },
          {
            memberships: {
              some: { circle: { memberships: { some: { userId: "viewer" } } } },
            },
          },
          { directConversationsA: { some: { userBId: "viewer" } } },
          { directConversationsB: { some: { userAId: "viewer" } } },
        ],
      },
    }),
  );
});

test("unauthenticated and unrelated viewers cannot trigger another user's token refresh", async () => {
  signedIn = false;
  expect((await request()).status).toBe(404);
  expect(findFirst).not.toHaveBeenCalled();
  signedIn = true;
  findFirst.mockResolvedValueOnce(null);
  expect((await request()).status).toBe(404);
  expect(refreshDiscordAvatar).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("admin can render users outside their circles", async () => {
  admin = true;
  findFirst.mockResolvedValueOnce(null);
  expect((await request()).status).toBe(200);
  expect(findUnique).toHaveBeenCalled();
});

test("arbitrary source URLs and excessive requests are rejected before refresh", async () => {
  expect((await request("src=https://evil.example/image")).status).toBe(400);
  limitAction.mockRejectedValueOnce(new Error("rate limit"));
  expect((await request()).status).toBe(429);
  expect(refreshDiscordAvatar).not.toHaveBeenCalled();
});

test("missing, invalid, oversized, and unavailable images are never cached", async () => {
  refreshDiscordAvatar.mockResolvedValueOnce(null);
  let response = await request();
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  for (const upstream of [
    new Response(null, { status: 404 }),
    new Response("html", { headers: { "content-type": "text/html" } }),
    new Response(new Uint8Array(1024 * 1024 + 1), {
      headers: { "content-type": "image/png" },
    }),
  ]) {
    fetchMock.mockResolvedValueOnce(upstream);
    response = await request();
    expect(response.ok).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  fetchMock.mockRejectedValueOnce(new Error("timeout"));
  response = await request();
  expect(response.status).toBe(502);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
