import {
  hlsAssetName,
  hlsContentType,
  rewriteHlsPlaylist,
} from "../../lib/hls";
import { verifyMediaScope } from "../../lib/media-token";

// Structural interfaces keep this worker testable with the same Web APIs in Bun.
export type MediaWorkerEnv = {
  MEDIA: {
    get(key: string): Promise<{
      body: ReadableStream<Uint8Array>;
      size: number;
      httpEtag: string;
      writeHttpMetadata(headers: Headers): void;
    } | null>;
  };
  MEDIA_CDN_SECRET: string;
  APP_ORIGIN: string;
};
type WorkerContext = { waitUntil(promise: Promise<unknown>): void };
type EdgeCache = Pick<Cache, "match" | "put">;

export async function serveMedia(
  request: Request,
  env: MediaWorkerEnv,
  context: WorkerContext,
  cache: EdgeCache,
) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "access-control-allow-origin": env.APP_ORIGIN,
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Range",
    "access-control-expose-headers":
      "Content-Length, Content-Range, Accept-Ranges, ETag",
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
    vary: "Origin",
  });
  if (origin && origin !== env.APP_ORIGIN)
    return new Response(null, { status: 403, headers });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405, headers });
  // Authentication is deliberately BEFORE cache lookup, including warm-cache hits.
  if (!(await verifyMediaScope(url, env.MEDIA_CDN_SECRET)))
    return new Response(null, { status: 403, headers });
  const key = url.pathname.slice(1);
  const name = key.slice(key.lastIndexOf("/") + 1);
  const scope = url.searchParams.get("scope") as string;
  if (key !== scope + name || !hlsAssetName.test(name))
    return new Response(null, { status: 404, headers });
  const cacheUrl = new URL(url);
  cacheUrl.search = "";
  const cacheKey = new Request(cacheUrl.toString());
  let stored = await cache.match(cacheKey);
  if (!stored) {
    const object = await env.MEDIA.get(key);
    if (!object) return new Response(null, { status: 404, headers });
    const storedHeaders = new Headers({
      "content-length": String(object.size),
      etag: object.httpEtag,
      "cache-control": "public, max-age=31536000, immutable",
    });
    object.writeHttpMetadata(storedHeaders);
    storedHeaders.set("cache-control", "public, max-age=31536000, immutable");
    stored = new Response(object.body, { headers: storedHeaders });
    // This cache is only accessible behind the authenticated worker. Never expose
    // its public caching header or token-bearing playlists to a shared outer cache.
    context.waitUntil(cache.put(cacheKey, stored.clone()).catch(() => {}));
  }
  if (name.endsWith(".m3u8")) {
    headers.set("content-type", hlsContentType);
    const playlist = rewriteHlsPlaylist(await stored.text(), (asset) => {
      const target = new URL(asset, url);
      target.search = url.search;
      return target.toString();
    });
    return new Response(request.method === "HEAD" ? null : playlist, {
      headers,
    });
  }
  headers.set("content-type", "video/mp2t");
  headers.set("accept-ranges", "bytes");
  if (stored.headers.has("etag"))
    headers.set("etag", stored.headers.get("etag") as string);
  const size = Number(stored.headers.get("content-length"));
  headers.set("content-length", String(size));
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = match?.[1]
      ? Number(match[1])
      : Math.max(0, size - Number(match?.[2]));
    const end =
      match?.[1] && match?.[2]
        ? Math.min(size - 1, Number(match[2]))
        : size - 1;
    if (
      !match ||
      (!match[1] && !match[2]) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= size
    ) {
      headers.set("content-range", `bytes */${size}`);
      headers.delete("content-length");
      return new Response(null, { status: 416, headers });
    }
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    headers.set("content-length", String(end - start + 1));
    // Segments are bounded to 16 MiB at ingestion. This fallback also handles a
    // range miss before the asynchronous edge cache fill completes.
    const bytes =
      request.method === "HEAD"
        ? null
        : (await stored.arrayBuffer()).slice(start, end + 1);
    return new Response(bytes, { status: 206, headers });
  }
  return new Response(request.method === "HEAD" ? null : stored.body, {
    headers,
  });
}

export default {
  async fetch(request: Request, env: MediaWorkerEnv, context: WorkerContext) {
    try {
      return await serveMedia(
        request,
        env,
        context,
        (caches as CacheStorage & { default: Cache }).default,
      );
    } catch {
      return new Response("Media temporarily unavailable.", {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "access-control-allow-origin": env.APP_ORIGIN,
        },
      });
    }
  },
};
