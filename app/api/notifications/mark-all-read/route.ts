import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const result = await getPrisma().notification.updateMany({
      where: {
        recipientId: auth.session.user.id,
        circleId: auth.membership.circleId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ marked: result.count });
  } catch (error) {
    return jsonError(error);
  }
}
