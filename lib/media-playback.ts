import { createHash } from "node:crypto";

export function mediaVersion(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

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
    url: `/api/media/${media.id}?v=${mediaVersion(media.objectKey)}`,
    expiresAt,
    duration: media.duration,
    poster: media.posterKey ? `/api/media/${media.id}?poster=1` : null,
  };
}
