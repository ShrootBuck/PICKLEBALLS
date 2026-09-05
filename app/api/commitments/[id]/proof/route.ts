import { after, NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { notifyProofSubmitted } from "@/lib/notifications";
import { runProofAssessment } from "@/lib/proof-assessment";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { readBoundedBody } from "@/lib/request-body";
import { submitProof } from "@/lib/tasks";
import { parsePhoenixLocalDateTime } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 120;

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
    await limitAction(auth.session.user.id, "uploads", 30, 600_000);
    const { id } = await context.params;
    const bytes = await readBoundedBody(request, 4 * 1024 * 1024 + 64 * 1024);
    let form: FormData;
    try {
      form = await new Response(bytes, {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid photo upload. Try choosing the file again." },
        { status: 400 },
      );
    }
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
    after(() => runProofAssessment(proof.id, uploaderId, circleId));

    return NextResponse.json({ proof }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
