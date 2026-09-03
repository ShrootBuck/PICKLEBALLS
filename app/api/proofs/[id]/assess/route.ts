import { NextResponse } from "next/server";
import { assessTaskProof } from "@/lib/ai";
import { jsonError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

// Retry a flopped AI assessment. Only FAILED proofs — fresh uploads already
// trigger a background run, so this never double-fires a PENDING one.
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
    const proof = await getPrisma().taskProof.findFirst({
      where: { id, circleId: auth.membership.circleId },
      include: { image: true, commitment: true },
    });
    if (!proof?.image)
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (proof.aiStatus !== "FAILED") {
      return NextResponse.json(
        { error: "AI already read this one." },
        { status: 409 },
      );
    }
    await getPrisma().taskProof.update({
      where: { id },
      data: { aiStatus: "PENDING" },
    });
    try {
      const assessment = await assessTaskProof(
        auth.session.user.id,
        auth.membership.circleId,
        {
          title: proof.commitment.title,
          definitionOfDone: proof.commitment.definitionOfDone,
          ownerNote: proof.ownerNote,
        },
        {
          data: proof.image.data,
          mimeType: proof.image.mimeType,
        },
      );
      await getPrisma().taskProof.update({
        where: { id },
        data: {
          aiStatus: "SUCCEEDED",
          aiVisibleEvidence: assessment.visibleEvidence,
          aiUncertainty: assessment.uncertainty,
          aiReviewerQuestion: assessment.reviewerQuestion,
          aiTaskMatch: assessment.taskMatch,
          aiOneLiner: assessment.oneLiner,
        },
      });
    } catch (error) {
      console.warn("AI assessment retry failed", {
        proofId: id,
        circleId: auth.membership.circleId,
        error,
      });
      await getPrisma()
        .taskProof.update({ where: { id }, data: { aiStatus: "FAILED" } })
        .catch(() => undefined);
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
