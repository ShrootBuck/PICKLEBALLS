import { APIError } from "better-auth/api";
import { NextResponse } from "next/server";
import { auth, internalSignupHeader } from "@/lib/auth";
import { signUpSchema } from "@/lib/auth-validation";
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

  const { inviteCode, name, email, password } = parsed.data;
  const prisma = getPrisma();
  const circle = await prisma.circle.findUnique({
    where: { inviteCode },
    select: { id: true },
  });

  if (!circle) {
    return NextResponse.json(
      { error: "That squad code is fake as hell." },
      { status: 403 },
    );
  }

  const authHeaders = new Headers(request.headers);
  authHeaders.set(internalSignupHeader, secret);

  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: authHeaders,
      returnHeaders: true,
    });

    try {
      const memberCount = await prisma.membership.count({
        where: { circleId: circle.id },
      });

      await prisma.membership.upsert({
        where: {
          userId_circleId: {
            userId: result.response.user.id,
            circleId: circle.id,
          },
        },
        update: {},
        create: {
          userId: result.response.user.id,
          circleId: circle.id,
          role: memberCount === 0 ? "OWNER" : "MEMBER",
        },
      });
    } catch (membershipError) {
      await prisma.user
        .delete({ where: { id: result.response.user.id } })
        .catch(() => undefined);
      throw membershipError;
    }

    const responseHeaders = new Headers(result.headers);
    responseHeaders.set("content-type", "application/json");

    return new Response(JSON.stringify({ user: result.response.user }), {
      status: 201,
      headers: responseHeaders,
    });
  } catch (error) {
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
