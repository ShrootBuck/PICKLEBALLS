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
  // Proof images are immutable: a proofId maps to exactly one byte blob for
  // its whole life (re-submits create a new proof row, never mutate).
  // So the browser can cache this permanently without ever revalidating.
  // The hash covers the bytes, so same-size different-image collisions
  // are impossible in practice.
  const etag = `"proof-${id}-${createHash("sha256").update(image.data).digest("hex").slice(0, 32)}"`;
  const headers: Record<string, string> = {
    "content-type": image.mimeType,
    "cache-control": "private, max-age=31536000, immutable",
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
