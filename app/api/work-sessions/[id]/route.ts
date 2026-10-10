import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { editWorkSession, stopWorkSession } from "@/lib/work-sessions";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/work-sessions/[id]">,
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "stopwatch", 60);
    const { id } = await context.params;
    const input = await readJson(request, 4096);
    const action =
      input && typeof input === "object" && "action" in input
        ? input.action
        : null;
    if (action !== "stop" && action !== "edit")
      return NextResponse.json(
        { error: "Choose Stop or Edit." },
        { status: 400 },
      );
    const session =
      action === "stop"
        ? await stopWorkSession(auth.session.user.id, id)
        : await editWorkSession(auth.session.user.id, id, input);
    return NextResponse.json({ session });
  } catch (error) {
    return jsonError(error);
  }
}
