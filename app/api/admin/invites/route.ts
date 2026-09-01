import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createInviteSchema } from "@/lib/auth-validation";
import {
  createInviteToken,
  hashInviteToken,
  inviteLifetimeMs,
  isAdminEmail,
} from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("origin") !== requestUrl.origin) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = createInviteSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Fix the invite form.",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { circleId: true },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "Your admin account is not attached to a squad." },
      { status: 409 },
    );
  }

  const token = createInviteToken();
  const invite = await prisma.invite.create({
    data: {
      tokenHash: hashInviteToken(token),
      label: parsed.data.label,
      expiresAt: new Date(Date.now() + inviteLifetimeMs),
      createdById: session.user.id,
      circleId: membership.circleId,
    },
    select: { id: true, expiresAt: true },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? requestUrl.origin;
  const url = new URL(`/join/${token}`, appUrl).toString();

  return NextResponse.json(
    { id: invite.id, url, expiresAt: invite.expiresAt.toISOString() },
    { status: 201 },
  );
}
