import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { nudgeStreak } from "@/lib/streaks";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "streak-nudges", 30, 60_000);
    const { id } = await context.params;
    return NextResponse.json(
      await nudgeStreak(id, auth.session.user.id, auth.membership.circleId),
    );
  } catch (error) {
    return jsonError(error);
  }
}
