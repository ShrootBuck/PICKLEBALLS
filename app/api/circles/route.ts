import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import {
  ACTIVE_CIRCLE_COOKIE,
  createCircle,
  listMyCircles,
  MAX_CIRCLE_NAME_LENGTH,
} from "@/lib/circles";

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_CIRCLE_NAME_LENGTH),
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
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const parsed = createSchema.safeParse(
    await readJson(request).catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Give your circle a name (1–40 characters)." },
      { status: 400 },
    );
  }
  try {
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
