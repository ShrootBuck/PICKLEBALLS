import { APIError } from "better-auth/api";
import { NextResponse } from "next/server";
import { auth, internalSignupHeader } from "@/lib/auth";
import { signUpSchema } from "@/lib/auth-validation";
import { hashInviteToken, inviteClaimLifetimeMs } from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = signUpSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the form and try again.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Auth is not configured on this server yet." },
      { status: 503 },
    );
  }

  const { inviteToken, name, email, password } = parsed.data;
  const prisma = getPrisma();
  const now = new Date();
  const tokenHash = hashInviteToken(inviteToken);
  const invite = await prisma.invite.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: now },
      revokedAt: null,
      usedAt: null,
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
    },
    select: {
      id: true,
      circleId: true,
      email: true,
      role: true,
    },
  });

  if (!invite) {
    return NextResponse.json(
      { error: "That invite is dead, expired, or already used." },
      { status: 403 },
    );
  }

  if (invite.email && invite.email.toLowerCase() !== email) {
    return NextResponse.json(
      { error: `This invite is locked to ${invite.email}.` },
      { status: 403 },
    );
  }

  const claimExpiresAt = new Date(now.getTime() + inviteClaimLifetimeMs);
  const claim = await prisma.invite.updateMany({
    where: {
      id: invite.id,
      expiresAt: { gt: now },
      revokedAt: null,
      usedAt: null,
      OR: [{ claimExpiresAt: null }, { claimExpiresAt: { lt: now } }],
    },
    data: { claimExpiresAt },
  });

  if (claim.count !== 1) {
    return NextResponse.json(
      { error: "Someone is already using that invite. Try again shortly." },
      { status: 409 },
    );
  }

  const authHeaders = new Headers(request.headers);
  authHeaders.set(internalSignupHeader, secret);
  let createdUserId: string | undefined;

  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: authHeaders,
      returnHeaders: true,
    });
    createdUserId = result.response.user.id;

    await prisma.$transaction(async (transaction) => {
      const redemption = await transaction.invite.updateMany({
        where: {
          id: invite.id,
          claimExpiresAt,
          revokedAt: null,
          usedAt: null,
        },
        data: {
          claimExpiresAt: null,
          usedAt: new Date(),
          usedById: result.response.user.id,
        },
      });

      if (redemption.count !== 1) {
        throw new Error("Invite claim was lost before redemption.");
      }

      await transaction.membership.upsert({
        where: {
          userId_circleId: {
            userId: result.response.user.id,
            circleId: invite.circleId,
          },
        },
        update: { role: invite.role },
        create: {
          userId: result.response.user.id,
          circleId: invite.circleId,
          role: invite.role,
        },
      });
    });

    const responseHeaders = new Headers(result.headers);
    responseHeaders.set("content-type", "application/json");

    return new Response(JSON.stringify({ user: result.response.user }), {
      status: 201,
      headers: responseHeaders,
    });
  } catch (error) {
    if (createdUserId) {
      await prisma.user
        .delete({ where: { id: createdUserId } })
        .catch(() => undefined);
    }

    await prisma.invite
      .updateMany({
        where: {
          id: invite.id,
          claimExpiresAt,
          usedAt: null,
        },
        data: { claimExpiresAt: null },
      })
      .catch(() => undefined);

    if (error instanceof APIError) {
      return NextResponse.json(
        { error: error.message || "Could not create the account." },
        { status: error.statusCode },
      );
    }

    console.error("Invite sign-up failed", error);
    return NextResponse.json(
      { error: "Could not create the account. Try again." },
      { status: 500 },
    );
  }
}
