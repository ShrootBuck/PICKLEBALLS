import { afterEach, expect, mock, test } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

mock.module("server-only", () => ({}));
const database: Record<string, Record<string, unknown>[]> = {
  user: [],
  session: [],
  account: [],
  verification: [],
  rateLimit: [],
};
mock.module("@better-auth/prisma-adapter", () => ({
  prismaAdapter: () => memoryAdapter(database),
}));
mock.module("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "test-cookies" }),
}));
mock.module("@/lib/bootstrap", () => ({
  ensureBootstrapMembership: async () => null,
}));
mock.module("@/lib/rate-limit", () => ({ limitAction: async () => {} }));
const updateMany = mock(async (_args: unknown) => ({ count: 1 }));
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({ user: { updateMany } }),
}));
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET =
  "avatar-test-secret-that-is-long-enough-for-better-auth";
const { auth } = await import("@/lib/auth");
const { refreshDiscordAvatar } = await import("@/lib/discord-avatar");
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("real Better Auth decrypts expired credentials, rotates them, and fetches the target's profile without a session", async () => {
  const context = await auth.$context;
  const discord = (await context.socialProviders).find(
    (provider) => provider.id === "discord",
  );
  if (!discord) throw new Error("Missing Discord provider");
  const refreshToken = mock(async (_token: string) => ({
    accessToken: "fresh-access-token",
    refreshToken: "rotated-refresh-token",
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    scopes: ["identify"],
  }));
  discord.refreshAccessToken = refreshToken;
  database.user.push({
    id: "target",
    name: "Circle Display Name",
    email: "target@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  database.account.push({
    id: "discord-account",
    userId: "target",
    providerId: "discord",
    issuer: "https://discord.com",
    accountId: "1139773304744448000",
    accessToken: await symmetricEncrypt({
      key: context.secretConfig,
      data: "expired-access-token",
    }),
    refreshToken: await symmetricEncrypt({
      key: context.secretConfig,
      data: "existing-refresh-token",
    }),
    accessTokenExpiresAt: new Date(Date.now() - 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    scope: "identify email",
  });
  const profileFetch = mock(async (_url: unknown, _init?: RequestInit) =>
    Response.json({
      id: "1139773304744448000",
      avatar: "fedcba",
      discriminator: "0",
    }),
  );
  globalThis.fetch = profileFetch as unknown as typeof fetch;
  expect(
    await refreshDiscordAvatar({
      id: "target",
      image: null,
      accounts: [{ id: "discord-account", accountId: "1139773304744448000" }],
    }),
  ).toBe(
    "https://cdn.discordapp.com/avatars/1139773304744448000/fedcba.png?size=128",
  );
  expect(refreshToken).toHaveBeenCalledTimes(1);
  expect(refreshToken.mock.calls[0][0]).toBe("existing-refresh-token");
  expect(profileFetch.mock.calls[0][1]?.headers).toEqual({
    authorization: "Bearer fresh-access-token",
  });
  const stored = database.account[0];
  expect(stored.accessToken).not.toBe("fresh-access-token");
  expect(stored.refreshToken).not.toBe("rotated-refresh-token");
  expect(
    await symmetricDecrypt({
      key: context.secretConfig,
      data: stored.accessToken as string,
    }),
  ).toBe("fresh-access-token");
  expect(
    await symmetricDecrypt({
      key: context.secretConfig,
      data: stored.refreshToken as string,
    }),
  ).toBe("rotated-refresh-token");
  expect(database.user[0].name).toBe("Circle Display Name");
  expect(updateMany).toHaveBeenCalledWith({
    where: { id: "target", image: null },
    data: {
      image:
        "https://cdn.discordapp.com/avatars/1139773304744448000/fedcba.png?size=128",
    },
  });
});
