import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { removeStreakEntry } from "@/lib/streaks";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; entryId: string }> },
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "streak-entries", 60, 60_000);
    const { id, entryId } = await context.params;
    return NextResponse.json(
      await removeStreakEntry(
        id,
        entryId,
        auth.session.user.id,
        auth.membership.circleId,
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
