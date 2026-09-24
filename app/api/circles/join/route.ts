import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ACTIVE_CIRCLE_COOKIE } from "@/lib/circles";
import { hashInviteToken, redeemReservedInvite } from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { hasSameOrigin } from "@/lib/request";

const schema = z.object({ token: z.string().min(32).max(200) });

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const parsed = schema.safeParse(await readJson(request).catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That invite looks wrong." },
      { status: 400 },
    );
  }
  try {
    const userId = session.user.id;
    await limitAction(userId, "join", 10, 60_000);
    const now = new Date();
    const prisma = getPrisma();
    // Looked up regardless of state, so a retry after a successful join
    // (whose invite is now used) still recognizes the new member.
    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashInviteToken(parsed.data.token) },
      select: {
        id: true,
        circleId: true,
        expiresAt: true,
        revokedAt: true,
        usedAt: true,
        claimExpiresAt: true,
      },
    });
    if (!invite) return unavailable();
    const isMember = async () =>
      Boolean(
        await prisma.membership.findUnique({
          where: {
            userId_circleId: { userId, circleId: invite.circleId },
          },
          select: { circleId: true },
        }),
      );
    if (await isMember()) return joined(invite.circleId, true);
    if (
      invite.expiresAt <= now ||
      invite.revokedAt ||
      invite.usedAt ||
      (invite.claimExpiresAt && invite.claimExpiresAt >= now)
    ) {
      return unavailable();
    }
    // Logged-in join bypasses the OAuth reservation dance: claim the invite
    // directly and atomically so a double-submit cannot double-spend it.
    const claimNonce = `direct-${userId}-${now.getTime()}`;
    const claimed = await prisma.invite.updateMany({
      where: {
        id: invite.id,
        expiresAt: { gt: now },
        revokedAt: null,
        usedAt: null,
        OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
      },
      data: {
        claimNonce,
        claimExpiresAt: new Date(now.getTime() + 60_000),
      },
    });
    if (claimed.count !== 1) {
      // A concurrent request from this same user may have just won the claim.
      if (await isMember()) return joined(invite.circleId, true);
      return NextResponse.json(
        { error: "Someone just claimed that invite. Ask for a fresh one." },
        { status: 409 },
      );
    }
    await redeemReservedInvite(invite.id, claimNonce, userId, new Date());
    return joined(invite.circleId, false);
  } catch (error) {
    return jsonError(error);
  }
}

function unavailable() {
  return NextResponse.json(
    { error: "That invite is expired, used, or revoked." },
    { status: 404 },
  );
}

function joined(circleId: string, alreadyMember: boolean) {
  const response = NextResponse.json(
    alreadyMember ? { ok: true, alreadyMember } : { ok: true },
  );
  response.cookies.set(ACTIVE_CIRCLE_COOKIE, circleId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
