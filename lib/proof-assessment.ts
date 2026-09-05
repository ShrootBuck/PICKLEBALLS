import "server-only";

import { assessTaskProof } from "@/lib/ai";
import { getPrisma } from "@/lib/prisma";

export async function runProofAssessment(
  proofId: string,
  userId: string,
  circleId: string,
) {
  try {
    const proof = await getPrisma().taskProof.findFirst({
      where: { id: proofId, circleId },
      include: { image: true, commitment: true },
    });
    if (!proof?.image) throw new Error("Proof image unavailable.");
    const assessment = await assessTaskProof(
      userId,
      circleId,
      {
        title: proof.commitment.title,
        definitionOfDone: proof.commitment.definitionOfDone,
        ownerNote: proof.ownerNote,
      },
      { data: proof.image.data, mimeType: proof.image.mimeType },
    );
    await getPrisma().taskProof.update({
      where: { id: proofId },
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
    // SDK errors may contain request bodies. Never log photos or prompts.
    console.warn("Proof assessment failed", {
      proofId,
      errorType: error instanceof Error ? error.name : "Unknown",
    });
    await getPrisma().taskProof.updateMany({
      where: { id: proofId, circleId },
      data: { aiStatus: "FAILED" },
    });
  }
}
