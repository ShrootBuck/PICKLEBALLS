import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getRequestMembership } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/screen-time/receipts/[id]/image">,
) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { id } = await context.params;
  const image = await getPrisma().screenTimeReceiptImage.findFirst({
    where: { receiptId: id, receipt: { circleId: auth.membership.circleId } },
  });
  if (!image)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  // Receipt images are immutable: a receiptId maps to exactly one byte blob
  // for its whole life. Cache permanently in the browser.
  const etag = `"receipt-${id}-${image.sizeBytes}"`;
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
