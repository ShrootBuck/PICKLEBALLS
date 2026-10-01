import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { moodCheckInSchema, moodTone } from "@/lib/mood";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { setCheckIn } from "@/lib/tasks";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "check-ins", 30, 60_000);
    const parsed = moodCheckInSchema.safeParse(await readJson(request, 32_000));
    if (!parsed.success)
      throw new DomainError(
        "Choose how you feel from the options shown. Journal entries can be up to 5,000 characters.",
      );
    const result = await setCheckIn(
      auth.session.user.id,
      auth.membership.circleId,
      moodTone(parsed.data.valence) === "unpleasant" ? "NAY" : "YAY",
      undefined,
      new Date(),
      parsed.data,
    );
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
