import "server-only";

import { assessTaskProof } from "@/lib/ai";
import { getPrisma } from "@/lib/prisma";
import { getMediaBytes } from "@/lib/r2";

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
    if (!proof) throw new Error("Proof unavailable.");
    // The image assessor cannot inspect video. Make that limitation explicit.
    const firstImage = proof.mediaIds.find((id) => id.startsWith("i_"));
    const media = firstImage
      ? await getPrisma().mediaUpload.findUnique({ where: { id: firstImage } })
      : null;
    const data = media
      ? await getMediaBytes(media.objectKey)
      : proof.image?.objectKey
        ? await getMediaBytes(proof.image.objectKey)
        : proof.image?.data;
    if (!data) {
      await getPrisma().taskProof.update({
        where: { id: proofId },
        data: {
          aiStatus: "SUCCEEDED",
          aiUncertainty:
            "Video proof needs human review; AI has not watched this video.",
          aiOneLiner: "Video attached — ask a squad member to review.",
        },
      });
      return;
    }
    const assessment = await assessTaskProof(
      userId,
      circleId,
      {
        title: proof.commitment.title,
        definitionOfDone: proof.commitment.definitionOfDone,
        ownerNote: proof.ownerNote,
      },
      {
        data,
        mimeType: media?.mimeType ?? proof.image?.mimeType ?? "image/webp",
      },
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
