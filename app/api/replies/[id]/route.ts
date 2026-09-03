import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { deleteSocialReply, updateSocialReply } from "@/lib/social-replies";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/replies/[id]">,
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const reply = await updateSocialReply(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    return NextResponse.json({ reply });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/replies/[id]">,
) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const auth = await getRequestMembership(request.headers);
  if (!auth) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    const result = await deleteSocialReply(
      id,
      auth.session.user.id,
      auth.membership.circleId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
