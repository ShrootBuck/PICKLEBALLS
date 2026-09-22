import { jsonError } from "@/lib/api";
import { getPrisma } from "@/lib/prisma";
import { mediaDownloadUrl } from "@/lib/r2";
import { getRequestMembership } from "@/lib/request";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getRequestMembership(request.headers);
  if (!auth) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const { id } = await params;
    const file = await getPrisma().timeblockChatAttachment.findFirst({
      where: { id, chat: { userId: auth.session.user.id } },
    });
    if (!file)
      return Response.json({ error: "Attachment not found." }, { status: 404 });
    return new Response(null, {
      status: 307,
      headers: {
        Location: await mediaDownloadUrl(file.objectKey, file.mediaType, 300),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
