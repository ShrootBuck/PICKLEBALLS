import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { createStreak } from "@/lib/streaks";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "streaks", 20, 60_000);
    const streak = await createStreak(
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    return NextResponse.json({ streak: { id: streak.id } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
