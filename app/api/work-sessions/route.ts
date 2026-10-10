import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import {
  getActiveWorkSession,
  listWorkSessions,
  startWorkSession,
} from "@/lib/work-sessions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const taskId = new URL(request.url).searchParams.get("taskId");
    const [active, sessions] = await Promise.all([
      getActiveWorkSession(auth.session.user.id),
      taskId
        ? listWorkSessions(
            auth.session.user.id,
            auth.membership.circleId,
            taskId,
          )
        : null,
    ]);
    return NextResponse.json(
      { active, sessions, serverNow: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "stopwatch", 60);
    const session = await startWorkSession(
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request, 4096),
    );
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
