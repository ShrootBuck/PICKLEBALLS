import { after, NextResponse } from "next/server";
import { assessTaskProof } from "@/lib/ai";
import { jsonError } from "@/lib/api";
import { notifyProofSubmitted } from "@/lib/notifications";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { submitProof } from "@/lib/tasks";
import { parsePhoenixLocalDateTime } from "@/lib/time";

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
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > 7 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image payload too large." },
        { status: 413 },
      );
    }
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File))
      return NextResponse.json(
        { error: "Attach a proof photo." },
        { status: 400 },
      );
    // Cap before trim so a multi-MB note never gets fully materialized
    // into a string that Zod just rejects anyway.
    const note =
      String(form.get("note") ?? "")
        .slice(0, 5000)
        .trim() || null;
    const startedAt = parsePhoenixLocalDateTime(
      String(form.get("startedAt") ?? "").slice(0, 40),
    );
    const completedAt = parsePhoenixLocalDateTime(
      String(form.get("completedAt") ?? "").slice(0, 40),
    );
    if (!startedAt || !completedAt) {
      return NextResponse.json(
        { error: "Add a valid start and finish time." },
        { status: 400 },
      );
    }
    const proof = await submitProof(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      file,
      note,
      startedAt,
      completedAt,
    );

    // Run AI assessment in the background so upload feels instant.
    // Uses Next.js `after()` to keep work alive after response.
    const uploaderId = auth.session.user.id;
    const circleId = auth.membership.circleId;
    const submittedProofId = proof.id;
    after(async () => {
      try {
        await notifyProofSubmitted({
          proofId: submittedProofId,
          actorId: uploaderId,
          circleId,
        });
      } catch (error) {
        console.warn("Proof notification fan-out failed", {
          proofId: submittedProofId,
          circleId,
          error,
        });
      }
    });
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
          uploaderId,
          circleId,
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
      } catch (error) {
        console.warn("AI assessment failed", {
          proofId: proof.id,
          circleId,
          error,
        });
        await getPrisma()
          .taskProof.update({
            where: { id: proof.id },
            data: { aiStatus: "FAILED" },
          })
          .catch(() => undefined);
      }
    });

    return NextResponse.json({ proof }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
