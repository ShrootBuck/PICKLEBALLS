import { after, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { runProofAssessment } from "@/lib/proof-assessment";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    const { id } = await context.params;
    const circleId = auth.membership.circleId;
    const proof = await getPrisma().taskProof.findFirst({
      where: { id, circleId, replacedById: null },
      select: { id: true, aiStatus: true, submittedAt: true },
    });
    if (!proof)
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    const stale =
      proof.aiStatus === "PENDING" &&
      Date.now() - proof.submittedAt.getTime() > 120_000;
    if (proof.aiStatus !== "FAILED" && !stale)
      return NextResponse.json(
        { error: "AI is already reading this, or has finished." },
        { status: 409 },
      );
    await limitAction(id, "proof-assessment", 1, 90_000);
    await getPrisma().taskProof.update({
      where: { id },
      data: { aiStatus: "PENDING" },
    });
    const userId = auth.session.user.id;
    after(() => runProofAssessment(id, userId, circleId));
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
