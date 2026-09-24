import { beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
type InviteRow = {
  id: string;
  circleId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  usedAt: Date | null;
  claimExpiresAt: Date | null;
};
let invite: InviteRow | null = null;
const inviteFind = mock(async () => invite);
const claim = mock(async (): Promise<{ count: number }> => ({ count: 1 }));
const membershipFind = mock(
  async (): Promise<{ circleId: string } | null> => null,
);
const redeem = mock(async () => {});
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    invite: { findUnique: inviteFind, updateMany: claim },
    membership: { findUnique: membershipFind },
  }),
}));
mock.module("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "me" } }) } },
}));
mock.module("@/lib/circles", () => ({ ACTIVE_CIRCLE_COOKIE: "circle" }));
mock.module("@/lib/invites", () => ({
  hashInviteToken: (token: string) => `hash:${token}`,
  redeemReservedInvite: redeem,
}));
mock.module("@/lib/rate-limit", () => ({ limitAction: async () => {} }));
mock.module("@/lib/request", () => ({ hasSameOrigin: () => true }));
const { POST } = await import("@/app/api/circles/join/route");

const join = async () => {
  const response = await POST(
    new Request("http://localhost/api/circles/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "t".repeat(40) }),
    }),
  );
  return { status: response.status, body: await response.json() };
};
const openInvite = (): InviteRow => ({
  id: "invite",
  circleId: "circle-1",
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  usedAt: null,
  claimExpiresAt: null,
});

beforeEach(() => {
  invite = openInvite();
  for (const fn of [inviteFind, claim, membershipFind, redeem]) fn.mockClear();
});

test("an open invite is claimed and redeemed with the same nonce", async () => {
  expect(await join()).toEqual({ status: 200, body: { ok: true } });
  const [[claimArgs]] = claim.mock.calls as unknown as [
    [{ data: { claimNonce: string } }],
  ];
  expect(redeem).toHaveBeenCalledWith(
    "invite",
    claimArgs.data.claimNonce,
    "me",
    expect.any(Date),
  );
});

test("retrying after a successful join succeeds even though the invite is used", async () => {
  invite = { ...openInvite(), usedAt: new Date() };
  membershipFind.mockResolvedValueOnce({ circleId: "circle-1" });
  expect(await join()).toEqual({
    status: 200,
    body: { ok: true, alreadyMember: true },
  });
  expect(claim).not.toHaveBeenCalled();
});

test("used, revoked, expired, or actively claimed invites stay unavailable to non-members", async () => {
  for (const change of [
    { usedAt: new Date() },
    { revokedAt: new Date() },
    { expiresAt: new Date(Date.now() - 1) },
    { claimExpiresAt: new Date(Date.now() + 60_000) },
  ]) {
    invite = { ...openInvite(), ...change };
    expect((await join()).status).toBe(404);
  }
  invite = null;
  expect((await join()).status).toBe(404);
  expect(claim).not.toHaveBeenCalled();
});

test("losing the claim to a concurrent request from the same user still succeeds", async () => {
  claim.mockResolvedValueOnce({ count: 0 });
  membershipFind
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ circleId: "circle-1" });
  expect(await join()).toEqual({
    status: 200,
    body: { ok: true, alreadyMember: true },
  });
  expect(redeem).not.toHaveBeenCalled();
});

test("losing the claim to someone else is a conflict", async () => {
  claim.mockResolvedValueOnce({ count: 0 });
  expect((await join()).status).toBe(409);
  expect(redeem).not.toHaveBeenCalled();
});
