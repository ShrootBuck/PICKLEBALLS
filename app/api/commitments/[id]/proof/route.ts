import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import {
  assessProofInBackground,
  notifyProofSubmitted,
} from "@/lib/background";
import { startPendingProof } from "@/lib/media-dispatch";
import { queueProof } from "@/lib/pending-proof";
import { proofProgressResponse } from "@/lib/proof-progress-response";
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
    const isJson = request.headers
      .get("content-type")
      ?.includes("application/json");
    let input: Record<string, unknown> = {};
    if (isJson) {
      const value = await readJson(request);
      if (!value || typeof value !== "object" || Array.isArray(value))
        return NextResponse.json({ error: "Invalid proof." }, { status: 400 });
      input = value as Record<string, unknown>;
    }
    const bytes = isJson
      ? new Uint8Array()
      : await readBoundedBody(request, 4 * 1024 * 1024 + 64 * 1024);
    let form: FormData;
    try {
      form = isJson
        ? new FormData()
        : await new Response(bytes, {
            headers: {
              "content-type": request.headers.get("content-type") ?? "",
            },
          }).formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid photo upload. Try choosing the file again." },
        { status: 400 },
      );
    }
    const file = isJson ? input.mediaIds : form.get("image");
    if (
      !(file instanceof File) &&
      !(
        Array.isArray(file) &&
        file.length > 0 &&
        file.every((id) => typeof id === "string")
      )
    )
      return NextResponse.json(
        { error: "Attach a proof photo." },
        { status: 400 },
      );
    // Cap before trim so a multi-MB note never gets fully materialized
    // into a string that Zod just rejects anyway.
    const note =
      String((isJson ? input.note : form.get("note")) ?? "")
        .slice(0, 5000)
        .trim() || null;
    const startedAt = parsePhoenixLocalDateTime(
      String((isJson ? input.startedAt : form.get("startedAt")) ?? "").slice(
        0,
        40,
      ),
    );
    const completedAt = parsePhoenixLocalDateTime(
      String(
        (isJson ? input.completedAt : form.get("completedAt")) ?? "",
      ).slice(0, 40),
    );
    if (!startedAt || !completedAt) {
      return NextResponse.json(
        { error: "Add a valid start and finish time." },
        { status: 400 },
      );
    }
    if (Array.isArray(file) && file.some((id) => String(id).startsWith("v_"))) {
      const pending = await queueProof(
        id,
        auth.session.user.id,
        auth.membership.circleId,
        file as string[],
        note,
        startedAt,
        completedAt,
      );
      try {
        await startPendingProof(pending.id);
      } catch {
        console.warn("Pending proof dispatch will be retried", {
          pendingId: pending.id,
        });
      }
      return Response.json(
        { pending: { id: pending.id, proofId: pending.proofId } },
        { status: 202 },
      );
    }
    const proof = await submitProof(
      id,
      auth.session.user.id,
      auth.membership.circleId,
      file as File | string[],
      note,
      startedAt,
      completedAt,
    );

    // Run AI assessment in the background so upload feels instant.
    // Trigger.dev owns assessment execution when configured.
    const uploaderId = auth.session.user.id;
    const circleId = auth.membership.circleId;
    const submittedProofId = proof.id;
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
    return proofProgressResponse(request, { proof }, 201, () =>
      assessProofInBackground(proof.id, uploaderId, circleId),
    );
  } catch (error) {
    return jsonError(error);
  }
}
