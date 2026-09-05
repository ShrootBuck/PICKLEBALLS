import { after, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { notifySquadUpdate } from "@/lib/notifications";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { createCommitment } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "tasks", 30, 60_000);
    const task = await createCommitment(
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    after(async () => {
      try {
        await notifySquadUpdate({
          actorId: auth.session.user.id,
          circleId: auth.membership.circleId,
          entityId: task.id,
          kind: "TASK_CREATED",
          description: task.title,
        });
      } catch {
        console.warn("Squad update notification failed.");
      }
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
