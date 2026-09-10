import { jsonError, readJson } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { startPendingProof } from "@/lib/media-dispatch";
import { pendingProofStatus } from "@/lib/pending-proof";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";
import { serializable } from "@/lib/transaction";

export async function GET(request: Request) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(
    {
      pending: await pendingProofStatus(
        auth.session.user.id,
        auth.membership.circleId,
      ),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const input = (await readJson(request)) as { id?: string; action?: string };
    if (
      typeof input?.id !== "string" ||
      !["retry", "dismiss"].includes(input.action ?? "")
    )
      throw new DomainError("Invalid action.");
    const id = input.id;
    const pending = await serializable(async (tx) => {
      const pending = await tx.pendingProof.findFirst({
        where: {
          id,
          ownerId: auth.session.user.id,
          circleId: auth.membership.circleId,
          dismissed: false,
        },
      });
      if (!pending) throw new DomainError("Post not found.", 404);
      if (input.action === "dismiss") {
        if (!pending.proofId && !pending.error)
          throw new DomainError(
            "Wait for processing to finish before removing this submission.",
            409,
          );
        await tx.pendingProof.update({
          where: { id },
          data: { dismissed: true },
        });
        await tx.mediaUpload.updateMany({
          where: { pendingProofId: id, claimed: false },
          data: { pendingProofId: null },
        });
      } else {
        if (pending.proofId || !pending.error)
          throw new DomainError(
            "This post is already published or still processing.",
            409,
          );
        await tx.pendingProof.update({
          where: { id },
          data: { error: null, attempt: { increment: 1 } },
        });
        await tx.mediaUpload.updateMany({
          where: {
            pendingProofId: id,
            ready: false,
            processingError: { not: null },
          },
          data: {
            processingError: null,
            encodeAttempt: { increment: 1 },
            progress: 0,
          },
        });
      }
      return pending;
    });
    if (input.action === "retry") await startPendingProof(pending.id);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
