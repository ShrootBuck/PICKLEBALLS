import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { planBucketItem, withdrawBucketItem } from "@/lib/bucket-list";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/bucket-list/[id]">,
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "bucket-votes", 60, 60_000);
    const { id } = await context.params;
    const item = await withdrawBucketItem(
      id,
      auth.session.user.id,
      auth.membership.circleId,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/bucket-list/[id]">,
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "bucket-votes", 60, 60_000);
    const { id } = await context.params;
    const item = await planBucketItem(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    return NextResponse.json({ item });
  } catch (error) {
    return jsonError(error);
  }
}
