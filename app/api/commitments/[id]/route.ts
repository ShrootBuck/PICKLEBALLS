import { after, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { notifySquadUpdate } from "@/lib/notifications";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { updateCommitment } from "@/lib/tasks";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/commitments/[id]">,
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { id } = await context.params;
    const { task, changed } = await updateCommitment(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    if (changed)
      after(async () => {
        try {
          await notifySquadUpdate({
            actorId: auth.session.user.id,
            circleId: auth.membership.circleId,
            entityId: task.id,
            kind: "TASK_RENEGOTIATED",
            description: task.title,
          });
        } catch {
          console.warn("Squad update notification failed.");
        }
      });
    return NextResponse.json({ task });
  } catch (error) {
    return jsonError(error);
  }
}
