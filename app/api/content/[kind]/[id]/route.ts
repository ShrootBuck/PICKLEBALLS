import { after } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { drainObjectDeletions } from "@/lib/deletion-storage";
import { deleteContent } from "@/lib/deletions";
import { DomainError } from "@/lib/errors";
import { limitAction } from "@/lib/rate-limit";
import { getRequestMembership, hasSameOrigin } from "@/lib/request";

const kinds = z.enum([
  "goal",
  "reply",
  "proof",
  "check-in",
  "screen-time",
  "bucket-item",
  "task",
]);
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Bad origin." }, { status: 403 });
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { kind, id } = await params;
    const parsed = kinds.safeParse(kind);
    if (!parsed.success) throw new DomainError("Content not found.", 404);
    const body = (await readJson(request)) as { circleId?: unknown };
    if (body?.circleId !== auth.membership.circleId)
      throw new DomainError(
        "Your active circle changed. Refresh and try again.",
        409,
      );
    await limitAction(auth.session.user.id, "content-deletion", 60, 60_000);
    const result = await deleteContent(
      parsed.data,
      id,
      auth.session.user.id,
      auth.membership.circleId,
    );
    after(() =>
      drainObjectDeletions().catch(() =>
        console.error("File cleanup will retry."),
      ),
    );
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
