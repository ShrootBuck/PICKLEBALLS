import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
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
    const parsed = checkInSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new DomainError("Fix the check-in.");
    const { checkIn, update } = await setCheckIn(
      auth.session.user.id,
      auth.membership.circleId,
      parsed.data.signal,
      parsed.data.blocker,
    );
    return NextResponse.json({ checkIn, update: { id: update.id } });
  } catch (error) {
    return jsonError(error);
  }
}
