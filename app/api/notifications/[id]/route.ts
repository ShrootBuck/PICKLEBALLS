import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = (await readJson(request)) as { read?: unknown };
    const read = body.read !== false;
    const existing = await getPrisma().notification.findFirst({
      where: {
        id,
        recipientId: auth.session.user.id,
        circleId: auth.membership.circleId,
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Notification not found." },
        { status: 404 },
      );
    }
    const updated = await getPrisma().notification.update({
      where: { id: existing.id },
      data: { readAt: read ? new Date() : null },
      select: { id: true, readAt: true },
    });
    return NextResponse.json({
      notification: {
        id: updated.id,
        readAt: updated.readAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
