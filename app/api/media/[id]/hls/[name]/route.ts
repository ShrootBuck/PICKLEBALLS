import { jsonError } from "@/lib/api";
import { authorizedMedia } from "@/lib/media-access";
import { hlsPlaylistResponse } from "@/lib/media-playback";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const { id, name } = await context.params;
    const media = await authorizedMedia(request.headers, id);
    if (!media?.hlsKey) return new Response(null, { status: 404 });
    return await hlsPlaylistResponse(id, media.hlsKey, name);
  } catch (error) {
    return jsonError(error);
  }
}
