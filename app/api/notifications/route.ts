import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const pageSize = 30;

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
    const cursor = url.searchParams.get("cursor");
    if (cursor && (cursor.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(cursor)))
      throw new DomainError("Invalid notification cursor.");
    const prisma = getPrisma();
    const userId = auth.session.user.id;
    const notifications = await prisma.notification.findMany({
      where: {
        recipientId: userId,
        circleId: auth.membership.circleId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
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
    const hasMore = notifications.length > pageSize;
    const items = (
      hasMore ? notifications.slice(0, pageSize) : notifications
    ).map((item) => ({
      ...item,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    }));
    const unreadCount = await prisma.notification.count({
      where: {
        recipientId: userId,
        circleId: auth.membership.circleId,
        readAt: null,
      },
    });
    return NextResponse.json({
      notifications: items,
      unreadCount,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
