import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
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
    const { endpoint, keys, userAgent } = parsed.data;
    const userId = auth.session.user.id;
    const data = {
      userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent ?? null,
    };
    const prisma = getPrisma();
    // Another account's endpoint may only move to this user when the caller
    // also holds its encryption keys, i.e. controls the same browser.
    const updated = await prisma.pushSubscription.updateMany({
      where: {
        endpoint,
        OR: [{ userId }, { p256dh: keys.p256dh, auth: keys.auth }],
      },
      data,
    });
    if (updated.count === 0) {
      try {
        await prisma.pushSubscription.create({ data: { ...data, endpoint } });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return NextResponse.json(
            { error: "This device is already linked to another account." },
            { status: 409 },
          );
        }
        throw error;
      }
    }
    return NextResponse.json({ subscription: { endpoint } }, { status: 201 });
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
