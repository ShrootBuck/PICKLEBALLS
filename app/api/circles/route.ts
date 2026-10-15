import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import { circleNameError, circleNameSchema } from "@/lib/circle-name";
import {
  ACTIVE_CIRCLE_COOKIE,
  createCircle,
  listMyCircles,
} from "@/lib/circles";
import { limitAction } from "@/lib/rate-limit";
import { hasSameOrigin } from "@/lib/request";

const createSchema = z.object({
  name: circleNameSchema,
});

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const memberships = await listMyCircles(session.user.id);
  return NextResponse.json({
    circles: memberships.map((membership) => ({
      id: membership.circle.id,
      slug: membership.circle.slug,
      name: membership.circle.name,
      role: membership.role,
      joinedAt: membership.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const parsed = createSchema.safeParse(
    await readJson(request).catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: circleNameError }, { status: 400 });
  }
  try {
    await limitAction(session.user.id, "circles", 10, 3_600_000);
    const { circle, membership } = await createCircle(
      session.user.id,
      parsed.data.name,
    );
    const response = NextResponse.json(
      {
        id: circle.id,
        slug: circle.slug,
        name: circle.name,
        role: membership.role,
      },
      { status: 201 },
    );
    response.cookies.set(ACTIVE_CIRCLE_COOKIE, circle.id, {
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
