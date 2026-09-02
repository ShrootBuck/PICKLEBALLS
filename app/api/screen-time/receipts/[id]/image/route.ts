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
  return new Response(image.data, {
    headers: {
      "content-type": image.mimeType,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
