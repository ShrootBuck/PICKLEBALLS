import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import {
  cancelBucketItemCompletion,
  requestBucketItemCompletion,
} from "@/lib/bucket-list";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/bucket-list/[id]/completion">,
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "bucket-votes", 60, 60_000);
    const { id } = await context.params;
    const item = await requestBucketItemCompletion(
      id,
      auth.session.user.id,
      auth.membership.circleId,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/bucket-list/[id]/completion">,
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await limitAction(auth.session.user.id, "bucket-votes", 60, 60_000);
    const { id } = await context.params;
    const item = await cancelBucketItemCompletion(
      id,
      auth.session.user.id,
      auth.membership.circleId,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return jsonError(error);
  }
}
