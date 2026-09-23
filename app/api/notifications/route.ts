import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { inboxKinds, notificationInboxSince } from "@/lib/notification-policy";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const prisma = getPrisma();
    const userId = auth.session.user.id;
    const recent = { gte: notificationInboxSince() };
    const notifications = await prisma.notification.findMany({
      where: {
        recipientId: userId,
        circleId: auth.membership.circleId,
        kind: { in: inboxKinds },
        createdAt: recent,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        kind: true,
        entityId: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
        actor: { select: { name: true, image: true, initials: true } },
      },
    });
    const items = notifications.map((item) => ({
      ...item,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    }));
    const unreadCount = await prisma.notification.count({
      where: {
        recipientId: userId,
        circleId: auth.membership.circleId,
        kind: { in: inboxKinds },
        createdAt: recent,
        readAt: null,
      },
    });
    return NextResponse.json({
      notifications: items,
      unreadCount,
    });
  } catch (error) {
    return jsonError(error);
  }
}
