import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { changeStreak, deleteStreak } from "@/lib/streaks";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "streak-edits", 60, 60_000);
    const { id } = await context.params;
    const streak = await changeStreak(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    return NextResponse.json({
      streak: { id: streak.id, status: streak.status },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "streak-edits", 60, 60_000);
    const { id } = await context.params;
    return NextResponse.json(
      await deleteStreak(id, auth.session.user.id, auth.membership.circleId),
    );
  } catch (error) {
    return jsonError(error);
  }
}
