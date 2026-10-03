import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { addStreakEntry } from "@/lib/streaks";

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
    await limitAction(auth.session.user.id, "streak-entries", 60, 60_000);
    const { id } = await context.params;
    const result = await addStreakEntry(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    return NextResponse.json(
      { summary: result.summary, milestone: result.milestone },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
