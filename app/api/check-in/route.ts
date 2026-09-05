import { after, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { notifySquadUpdate } from "@/lib/notifications";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { checkInSchema } from "@/lib/schemas";
import { DomainError, setCheckIn } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "check-ins", 30, 60_000);
    const parsed = checkInSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new DomainError("Fix the check-in.");
    const { checkIn, update } = await setCheckIn(
      auth.session.user.id,
      auth.membership.circleId,
      parsed.data.signal,
      parsed.data.blocker,
    );
    after(async () => {
      try {
        await notifySquadUpdate({
          actorId: auth.session.user.id,
          circleId: auth.membership.circleId,
          entityId: checkIn.id,
          kind: "CHECK_IN_SET",
          description:
            checkIn.blocker ||
            (checkIn.signal === "NAY"
              ? "Could use a hand today."
              : "Going well today."),
        });
      } catch {
        console.warn("Squad update notification failed.");
      }
    });
    return NextResponse.json({ checkIn, update: { id: update.id } });
  } catch (error) {
    return jsonError(error);
  }
}
