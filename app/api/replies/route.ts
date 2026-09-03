import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { createSocialReply } from "@/lib/social-replies";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    const reply = await createSocialReply(
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
