import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { changeGoal } from "@/lib/goals";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

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
    await limitAction(auth.session.user.id, "goal-edits", 60, 60_000);
    const { id } = await context.params;
    const goal = await changeGoal(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    return NextResponse.json({ goal });
  } catch (error) {
    return jsonError(error);
  }
}
