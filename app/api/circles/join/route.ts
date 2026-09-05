import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ACTIVE_CIRCLE_COOKIE } from "@/lib/circles";
import { hashInviteToken, redeemReservedInvite } from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";
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
    const now = new Date();
    const invite = await getPrisma().invite.findFirst({
      where: {
        tokenHash: hashInviteToken(parsed.data.token),
        expiresAt: { gt: now },
        revokedAt: null,
        usedAt: null,
        OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
      },
      select: { id: true, circleId: true },
    });
    if (!invite) {
      return NextResponse.json(
        { error: "That invite is expired, used, or revoked." },
        { status: 404 },
      );
    }
    const already = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: invite.circleId },
      },
      select: { circleId: true },
    });
    if (already) {
      const response = NextResponse.json({ ok: true, alreadyMember: true });
      response.cookies.set(ACTIVE_CIRCLE_COOKIE, invite.circleId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }
    // Logged-in join bypasses the OAuth reservation dance: claim the invite
    // directly and atomically so a double-submit cannot double-spend it.
    const claimed = await getPrisma().invite.updateMany({
      where: {
        id: invite.id,
        expiresAt: { gt: now },
        revokedAt: null,
        usedAt: null,
        OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
      },
      data: {
        claimNonce: `direct-${session.user.id}-${now.getTime()}`,
        claimExpiresAt: new Date(now.getTime() + 60_000),
      },
    });
    if (claimed.count !== 1) {
      return NextResponse.json(
        { error: "Someone just claimed that invite. Ask for a fresh one." },
        { status: 409 },
      );
    }
    const reservation = await getPrisma().invite.findUnique({
      where: { id: invite.id },
      select: { claimNonce: true },
    });
    if (!reservation?.claimNonce) {
      return NextResponse.json(
        { error: "That invite is expired, used, or revoked." },
        { status: 404 },
      );
    }
    await redeemReservedInvite(
      invite.id,
      reservation.claimNonce,
      session.user.id,
      new Date(),
    );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ACTIVE_CIRCLE_COOKIE, invite.circleId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
