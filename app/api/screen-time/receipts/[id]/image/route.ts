import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: RouteContext<"/api/screen-time/receipts/[id]/image">,
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || id.length > 128) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const image = await getPrisma().screenTimeReceiptImage.findFirst({
    where: {
      receiptId: id,
      receipt: {
        circle: {
          memberships: { some: { userId: session.user.id } },
        },
      },
    },
    select: { data: true, mimeType: true, sizeBytes: true, updatedAt: true },
  });
  if (!image) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return new Response(Buffer.from(image.data), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(image.sizeBytes),
      "Content-Type": image.mimeType,
      "Last-Modified": image.updatedAt.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
