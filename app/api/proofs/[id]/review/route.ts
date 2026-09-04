import { after, NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { notifyProofReviewed } from "@/lib/notifications";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { reviewProof } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/proofs/[id]/review">,
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { id } = await context.params;
    const review = await reviewProof(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      await readJson(request),
    );
    const reviewerId = auth.session.user.id;
    const circleId = auth.membership.circleId;
    const reviewId = review.id;
    after(async () => {
      try {
        await notifyProofReviewed({ reviewId, reviewerId, circleId });
      } catch (error) {
        console.warn("Review notification fan-out failed", {
          reviewId,
          circleId,
          error,
        });
      }
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
