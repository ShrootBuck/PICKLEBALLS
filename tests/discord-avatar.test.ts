import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { avatarSrc } from "@/lib/avatar-url";

mock.module("server-only", () => ({}));
const oldImage =
  "https://cdn.discordapp.com/avatars/1139773304744448000/abcdef.png";
const user = {
  id: "hashim",
  image: oldImage,
  accounts: [{ id: "linked-account", accountId: "1139773304744448000" }],
};
const getAccessToken = mock(async (_args: unknown) => ({
  accessToken: "test-access-token",
}));
const limitAction = mock(async (..._args: unknown[]) => {});
const updateMany = mock(async (_args: unknown) => ({ count: 1 }));
const findUnique = mock(async (_args: unknown) => ({ image: oldImage }));
mock.module("@/lib/auth", () => ({ auth: { api: { getAccessToken } } }));
mock.module("@/lib/rate-limit", () => ({ limitAction }));
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({ user: { updateMany, findUnique } }),
}));
const { refreshDiscordAvatar } = await import("@/lib/discord-avatar");
const originalFetch = globalThis.fetch;
const fetchMock = mock(async (_input: unknown, _init?: RequestInit) =>
  Response.json({
    id: user.accounts[0].accountId,
    avatar: "fedcba",
    discriminator: "0",
  }),
);
beforeEach(() => {
  getAccessToken.mockClear();
  getAccessToken.mockResolvedValue({ accessToken: "test-access-token" });
  limitAction.mockReset();
  updateMany.mockClear();
  updateMany.mockResolvedValue({ count: 1 });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () =>
    Response.json({
      id: user.accounts[0].accountId,
      avatar: "fedcba",
      discriminator: "0",
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("dead saved URLs are replaced and only the avatar is persisted", async () => {
  const image = await refreshDiscordAvatar(user);
  expect(image).toBe(
    "https://cdn.discordapp.com/avatars/1139773304744448000/fedcba.png?size=128",
  );
  expect(getAccessToken).toHaveBeenCalledWith({
    body: { userId: "hashim", accountId: "linked-account" },
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "https://discord.com/api/users/@me",
    expect.objectContaining({
      headers: { authorization: "Bearer test-access-token" },
      cache: "no-store",
      redirect: "error",
    }),
  );
  expect(updateMany).toHaveBeenCalledWith({
    where: { id: "hashim", image: oldImage },
    data: { image },
  });
});

test("concurrent renders share one refresh", async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, () => refreshDiscordAvatar(user)),
  );
  expect(new Set(results).size).toBe(1);
  expect(getAccessToken).toHaveBeenCalledTimes(1);
  expect(limitAction).toHaveBeenCalledWith(
    "hashim",
    "discord-avatar-refresh",
    1,
    300_000,
  );
});

test("shared cooldown skips provider calls", async () => {
  limitAction.mockRejectedValueOnce(new Error("cooldown"));
  expect(await refreshDiscordAvatar(user)).toBe(`${oldImage}?size=128`);
  expect(getAccessToken).not.toHaveBeenCalled();
});

test("removed and animated avatars use Discord's correct URLs", async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({
      id: user.accounts[0].accountId,
      avatar: null,
      discriminator: "0",
    }),
  );
  expect(await refreshDiscordAvatar(user)).toBe(
    "https://cdn.discordapp.com/embed/avatars/1.png?size=128",
  );
  fetchMock.mockResolvedValueOnce(
    Response.json({
      id: user.accounts[0].accountId,
      avatar: null,
      discriminator: "1234",
    }),
  );
  expect(await refreshDiscordAvatar(user)).toBe(
    "https://cdn.discordapp.com/embed/avatars/4.png?size=128",
  );
  fetchMock.mockResolvedValueOnce(
    Response.json({
      id: user.accounts[0].accountId,
      avatar: "a_abcdef",
      discriminator: "0",
    }),
  );
  expect(await refreshDiscordAvatar(user)).toBe(
    "https://cdn.discordapp.com/avatars/1139773304744448000/a_abcdef.gif?size=128",
  );
});

test("default and missing avatars can become custom pictures", async () => {
  for (const image of [
    null,
    "https://cdn.discordapp.com/embed/avatars/0.png",
  ]) {
    expect(await refreshDiscordAvatar({ ...user, image })).toContain(
      "/fedcba.png",
    );
    expect(avatarSrc(image ?? undefined, user.id)).toBe(
      "/api/avatar?userId=hashim",
    );
  }
  expect(avatarSrc(oldImage, user.id)).toBe("/api/avatar?userId=hashim");
  expect(avatarSrc("/fixture.png", user.id)).toBe("/fixture.png");
});

test("revoked grants, provider failures, and malformed or mismatched profiles preserve the old image", async () => {
  getAccessToken.mockRejectedValueOnce(new Error("revoked"));
  expect(await refreshDiscordAvatar(user)).toBe(`${oldImage}?size=128`);
  for (const response of [
    new Response(null, { status: 429 }),
    new Response(null, { status: 503 }),
    Response.json({ id: "999", avatar: "abcdef", discriminator: "0" }),
    Response.json({
      id: user.accounts[0].accountId,
      avatar: "../../evil",
      discriminator: "0",
    }),
  ]) {
    fetchMock.mockResolvedValueOnce(response);
    expect(await refreshDiscordAvatar(user)).toBe(`${oldImage}?size=128`);
  }
  fetchMock.mockRejectedValueOnce(new Error("timeout"));
  expect(await refreshDiscordAvatar(user)).toBe(`${oldImage}?size=128`);
  expect(updateMany).not.toHaveBeenCalled();
});

test("a newer sign-in wins an avatar update race", async () => {
  updateMany.mockResolvedValueOnce({ count: 0 });
  findUnique.mockResolvedValueOnce({
    image: "https://cdn.discordapp.com/embed/avatars/2.png",
  });
  expect(await refreshDiscordAvatar(user)).toBe(
    "https://cdn.discordapp.com/embed/avatars/2.png?size=128",
  );
});

test("unlinked users do not trigger OAuth", async () => {
  expect(await refreshDiscordAvatar({ ...user, accounts: [] })).toBe(
    `${oldImage}?size=128`,
  );
  expect(getAccessToken).not.toHaveBeenCalled();
});
