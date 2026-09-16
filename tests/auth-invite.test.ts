import { expect, mock, test } from "bun:test";
import { memoryAdapter } from "better-auth/adapters/memory";

mock.module("server-only", () => ({}));
const database = {
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
const redeemed: string[] = [];
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    membership: { findUnique: async () => null },
  }),
}));
mock.module("@/lib/bootstrap", () => ({
  ensureBootstrapMembership: async () => null,
}));
mock.module("@/lib/invites", () => ({
  reserveInvite: async () => ({ inviteId: "invite", claimNonce: "nonce" }),
  findReservedInvite: async (id: string, nonce: string) =>
    id === "invite" && nonce === "nonce" ? { id, circleId: "circle" } : null,
  redeemReservedInvite: async (_id: string, _nonce: string, userId: string) => {
    redeemed.push(userId);
  },
}));
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET =
  "test-secret-that-is-long-enough-for-better-auth";
const { auth } = await import("@/lib/auth");

test("Discord callback redeems a reserved invite after registration and returning sign-in", async () => {
  const context = await auth.$context;
  const providers = await context.socialProviders;
  const discord = providers.find((provider) => provider.id === "discord");
  if (!discord) throw new Error("Discord provider missing");
  discord.validateAuthorizationCode = async () => ({
    accessToken: "test-token",
  });
  discord.getUserInfo = async () => ({
    user: {
      name: "Test Friend",
      email: "friend@example.com",
      emailVerified: true,
    },
    data: { id: "discord-test-user" },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const start = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          provider: "discord",
          callbackURL: "/",
          requestSignUp: true,
          additionalData: { inviteToken: "test-invite" },
        }),
      }),
    );
    expect(start.status).toBe(200);
    const { url } = await start.json();
    const state = new URL(url).searchParams.get("state");
    if (!state) throw new Error("OAuth state missing");
    const cookies = start.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    const callback = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/callback/discord?code=test-code&state=${encodeURIComponent(state)}`,
        {
          headers: { cookie: cookies },
        },
      ),
    );
    expect(callback.status).toBe(302);
    expect(redeemed).toHaveLength(attempt + 1);
    expect(
      callback.headers
        .getSetCookie()
        .some((cookie) => cookie.includes("circle")),
    ).toBe(true);
  }
  expect(redeemed[0]).toBe(redeemed[1]);
});
