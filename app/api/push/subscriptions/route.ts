import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { pushSubscriptionSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  const prisma = getPrisma();
  if (endpoint) {
    const sub = await prisma.pushSubscription.findUnique({
      where: { endpoint },
      select: { userId: true },
    });
    return NextResponse.json({
      subscribed: sub?.userId === auth.session.user.id,
    });
  }
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: auth.session.user.id },
    select: { endpoint: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ subscriptions: subs });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    await limitAction(auth.session.user.id, "push", 30, 60_000);
    const parsed = pushSubscriptionSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid subscription." },
        { status: 400 },
      );
    }
    const sub = await getPrisma().pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      update: {
        userId: auth.session.user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: parsed.data.userAgent ?? null,
      },
      create: {
        userId: auth.session.user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: parsed.data.userAgent ?? null,
      },
      select: { endpoint: true },
    });
    return NextResponse.json({ subscription: sub }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const body = await readJson(request).catch(() => ({}));
    const endpoint =
      (body as { endpoint?: unknown }).endpoint ??
      new URL(request.url).searchParams.get("endpoint");
    if (typeof endpoint !== "string" || endpoint.length === 0) {
      return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });
    }
    await getPrisma().pushSubscription.deleteMany({
      where: { endpoint, userId: auth.session.user.id },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
