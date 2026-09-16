import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { hlsAssetName, hlsContentType, rewriteHlsPlaylist } from "@/lib/hls";
import { playbackLifetimeSeconds, signMediaScope } from "@/lib/media-token";
import { mediaDownloadUrl, r2 } from "@/lib/r2";

export async function playbackTicket(media: {
  id: string;
  objectKey: string;
  mimeType: string;
  hlsKey: string | null;
  duration: number | null;
  posterKey: string | null;
}) {
  const expires = Math.floor(Date.now() / 1000) + playbackLifetimeSeconds;
  let hlsUrl: string | null = media.hlsKey
    ? `/api/media/${media.id}/hls/master.m3u8`
    : null;
  const origin = process.env.MEDIA_CDN_ORIGIN;
  if (media.hlsKey && origin) {
    const secret = process.env.MEDIA_CDN_SECRET;
    if (!secret) throw new Error("Media CDN signing is not configured.");
    const base = new URL(origin);
    if (
      base.protocol !== "https:" ||
      base.pathname !== "/" ||
      base.search ||
      base.hash ||
      base.username ||
      base.password
    )
      throw new Error("MEDIA_CDN_ORIGIN must be an HTTPS origin.");
    const scope = media.hlsKey.slice(0, media.hlsKey.lastIndexOf("/") + 1);
    const url = new URL(`/${media.hlsKey}`, base);
    url.search = (await signMediaScope(scope, expires, secret)).toString();
    hlsUrl = url.toString();
  }
  return {
    url: await mediaDownloadUrl(
      media.objectKey,
      media.mimeType,
      playbackLifetimeSeconds,
    ),
    hlsUrl,
    expiresAt: expires * 1000,
    duration: media.duration,
    poster: media.posterKey ? `/api/media/${media.id}?poster=1` : null,
  };
}

// Without the edge worker, only small playlists go through Next.js. Video bytes
// still go directly to private R2 using signed URLs and its byte-range support.
export async function hlsPlaylistResponse(
  id: string,
  hlsKey: string,
  name: string,
) {
  if (!hlsAssetName.test(name) || !name.endsWith(".m3u8"))
    return new Response(null, { status: 404 });
  const prefix = hlsKey.slice(0, hlsKey.lastIndexOf("/") + 1);
  const { client, bucket } = r2();
  const object = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: `${prefix}${name}` }),
  );
  if (!object.Body || (object.ContentLength ?? Infinity) > 16 * 1024 * 1024)
    throw new Error("Video playlist unavailable.");
  const playlist = await object.Body.transformToString();
  const urls = new Map<string, string>();
  rewriteHlsPlaylist(playlist, (asset) => {
    urls.set(asset, "");
    return asset;
  });
  // Bound signing work for long videos; reuse the S3 client across every signature.
  const entries = [...urls.keys()];
  for (let start = 0; start < entries.length; start += 32) {
    await Promise.all(
      entries.slice(start, start + 32).map(async (asset) => {
        urls.set(
          asset,
          asset.endsWith(".m3u8")
            ? `/api/media/${id}/hls/${asset}`
            : await mediaDownloadUrl(
                `${prefix}${asset}`,
                "video/mp2t",
                playbackLifetimeSeconds,
              ),
        );
      }),
    );
  }
  return new Response(
    rewriteHlsPlaylist(playlist, (asset) => urls.get(asset) as string),
    {
      headers: {
        "content-type": hlsContentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
