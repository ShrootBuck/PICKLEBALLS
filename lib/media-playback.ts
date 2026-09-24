import "server-only";
import { mediaDownloadUrl } from "@/lib/r2";

const playbackLifetimeSeconds = 6 * 3600;

export async function playbackTicket(media: {
  id: string;
  objectKey: string;
  mimeType: string;
  duration: number | null;
  posterKey: string | null;
}) {
  const expiresAt = Date.now() + playbackLifetimeSeconds * 1000;
  return {
    url: await mediaDownloadUrl(
      media.objectKey,
      media.mimeType,
      playbackLifetimeSeconds,
    ),
    expiresAt,
    duration: media.duration,
    poster: media.posterKey ? `/api/media/${media.id}?poster=1` : null,
  };
}
