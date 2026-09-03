import { after, NextResponse } from "next/server";
import { assessTaskProof } from "@/lib/ai";
import { jsonError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { submitProof } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: RouteContext<"/api/commitments/[id]/proof">,
) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File))
      return NextResponse.json(
        { error: "Attach a proof photo." },
        { status: 400 },
      );
    const note = String(form.get("note") ?? "").trim() || null;
    const proof = await submitProof(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      file,
      note,
    );

    // Run AI assessment in the background so upload feels instant.
    // Uses Next.js `after()` to keep work alive after response.
    after(async () => {
      try {
        const proofWithTask = await getPrisma().taskProof.findUnique({
          where: { id: proof.id },
          include: { image: true, commitment: true },
        });
        if (!proofWithTask?.image) {
          await getPrisma().taskProof.update({
            where: { id: proof.id },
            data: { aiStatus: "FAILED" },
          });
          return;
        }
        const assessment = await assessTaskProof(
          auth.session.user.id,
          auth.membership.circleId,
          {
            title: proofWithTask.commitment.title,
            definitionOfDone: proofWithTask.commitment.definitionOfDone,
            ownerNote: proofWithTask.ownerNote,
          },
          {
            data: proofWithTask.image.data,
            mimeType: proofWithTask.image.mimeType,
          },
        );
        await getPrisma().taskProof.update({
          where: { id: proof.id },
          data: {
            aiStatus: "SUCCEEDED",
            aiVisibleEvidence: assessment.visibleEvidence,
            aiUncertainty: assessment.uncertainty,
            aiReviewerQuestion: assessment.reviewerQuestion,
            aiTaskMatch: assessment.taskMatch,
            aiOneLiner: assessment.oneLiner,
          },
        });
      } catch {
        await getPrisma()
          .taskProof.update({
            where: { id: proof.id },
            data: { aiStatus: "FAILED" },
          })
          .catch(() => undefined);
      }
    });

    return NextResponse.json(
      { proof: { ...proof, assessment: null } },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
