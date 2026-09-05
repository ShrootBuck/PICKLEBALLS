import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/proofs/[id]/image">,
) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { id } = await context.params;
  const image = await getPrisma().taskProofImage.findFirst({
    where: { proofId: id, proof: { circleId: auth.membership.circleId } },
  });
  if (!image)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Revalidate membership before serving cached images, including after sign-out.
  const etag = `"proof-${id}-${createHash("sha256").update(image.data).digest("hex").slice(0, 32)}"`;
  const headers: Record<string, string> = {
    "content-type": image.mimeType,
    "cache-control": "private, no-cache",
    etag,
    "last-modified": image.createdAt.toUTCString(),
    "content-length": String(image.sizeBytes),
    "x-content-type-options": "nosniff",
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(image.data, { headers });
}
