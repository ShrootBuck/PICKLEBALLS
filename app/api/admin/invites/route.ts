import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createInviteToken,
  hashInviteToken,
  inviteLifetimeMs,
} from "@/lib/invites";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

const schema = z.object({ label: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth || auth.membership.role !== "OWNER") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Add a name for the invite." },
      { status: 400 },
    );

  const token = createInviteToken();
  const invite = await getPrisma().invite.create({
    data: {
      tokenHash: hashInviteToken(token),
      label: parsed.data.label,
      expiresAt: new Date(Date.now() + inviteLifetimeMs),
      createdById: auth.session.user.id,
      circleId: auth.membership.circleId,
    },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  return NextResponse.json(
    {
      id: invite.id,
      expiresAt: invite.expiresAt,
      url: new URL(`/join/${token}`, appUrl),
    },
    { status: 201 },
  );
}
