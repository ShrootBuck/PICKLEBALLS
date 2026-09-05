import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ACTIVE_CIRCLE_COOKIE } from "@/lib/circles";
import { getPrisma } from "@/lib/prisma";
import { hasSameOrigin } from "@/lib/request";

const schema = z.object({ circleId: z.string().min(1).max(64) });

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const parsed = schema.safeParse(await readJson(request).catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a circle." }, { status: 400 });
  }
  try {
    const membership = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: {
          userId: session.user.id,
          circleId: parsed.data.circleId,
        },
      },
      select: { circleId: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ACTIVE_CIRCLE_COOKIE, membership.circleId, {
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
