import { expect, test } from "bun:test";
import { type MediaWorkerEnv, serveMedia } from "@/infra/media-worker";
import { readHlsSegments, rewriteHlsPlaylist } from "@/lib/hls";
import { signMediaScope, verifyMediaScope } from "@/lib/media-token";

const secret = "test-only-media-signing-secret-32-characters";
const prefix =
  "media/v_11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/hls/";
async function signed(
  name: string,
  scope = prefix,
  expires = Math.floor(Date.now() / 1000) + 3600,
) {
  const url = new URL(`https://media.example/${prefix}${name}`);
  url.search = (await signMediaScope(scope, expires, secret)).toString();
  return url;
}

test("playback signatures expire and cannot access another video or a different scope", async () => {
  const url = await signed("v0_000000.ts");
  expect(await verifyMediaScope(url, secret)).toBe(true);
  expect(await verifyMediaScope(url, secret, Date.now() + 7200_000)).toBe(
    false,
  );
  url.pathname = url.pathname.replace("v_1111", "v_9999");
  expect(await verifyMediaScope(url, secret)).toBe(false);
  const tampered = await signed("master.m3u8");
  tampered.searchParams.set(
    "expires",
    String(Math.floor(Date.now() / 1000) + 7200),
  );
  expect(await verifyMediaScope(tampered, secret)).toBe(false);
  expect(
    await verifyMediaScope(await signed("master.m3u8", "media/"), secret),
  ).toBe(false);
});

test("playlist rewrites reject external URLs and traversal", () => {
  for (const name of [
    "../secret.ts",
    "https://attacker.test/x.ts",
    "//attacker.test/x.ts",
    "v0.ts?token=x",
    "v0.ts\\x",
  ])
    expect(() =>
      rewriteHlsPlaylist(`#EXTM3U\n${name}`, (name) => name),
    ).toThrow();
  expect(() =>
    rewriteHlsPlaylist(
      '#EXTM3U\n#EXT-X-KEY:URI="https://attacker.test/key"',
      (name) => name,
    ),
  ).toThrow();
  expect(() => readHlsSegments("#EXTM3U\n#EXTINF:2,\nv0_000000.ts")).toThrow(
    "Incomplete",
  );
});

test("edge cache requires valid authorization even on a cache hit, rewrites child tickets and serves ranges", async () => {
  const entries = new Map<string, Response>();
  let reads = 0;
  const jobs: Promise<unknown>[] = [];
  const env: MediaWorkerEnv = {
    APP_ORIGIN: "https://app.example",
    MEDIA_CDN_SECRET: secret,
    MEDIA: {
      async get(key) {
        reads++;
        const value = key.endsWith("master.m3u8")
          ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nv0.m3u8\n"
          : "0123456789";
        return {
          body: new Response(value).body as ReadableStream<Uint8Array>,
          size: value.length,
          httpEtag: '"test"',
          writeHttpMetadata: () => {},
        };
      },
    },
  };
  const cache = {
    async match(input: RequestInfo | URL) {
      return entries.get((input as Request).url)?.clone();
    },
    async put(input: RequestInfo | URL, response: Response) {
      entries.set((input as Request).url, response);
    },
  };
  const context = {
    waitUntil(job: Promise<unknown>) {
      jobs.push(job);
    },
  };
  const url = await signed("master.m3u8");
  const first = await serveMedia(new Request(url), env, context, cache);
  const playlist = await first.text();
  const child = new URL(playlist.trim().split("\n").at(-1) as string);
  expect(await verifyMediaScope(child, secret)).toBe(true);
  expect(first.headers.get("cache-control")).toBe("private, no-store");
  await Promise.all(jobs);
  expect((await serveMedia(new Request(url), env, context, cache)).status).toBe(
    200,
  );
  expect(reads).toBe(1);
  const expired = await signed(
    "master.m3u8",
    prefix,
    Math.floor(Date.now() / 1000) - 1,
  );
  expect(
    (await serveMedia(new Request(expired), env, context, cache)).status,
  ).toBe(403);
  expect(
    (
      await serveMedia(
        new Request(url.origin + url.pathname),
        env,
        context,
        cache,
      )
    ).status,
  ).toBe(403);
  expect(reads).toBe(1);
  const segment = await signed("v0_000000.ts");
  const partial = await serveMedia(
    new Request(segment, {
      headers: { range: "bytes=2-5", origin: env.APP_ORIGIN },
    }),
    env,
    context,
    cache,
  );
  expect(partial.status).toBe(206);
  expect(partial.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(await partial.text()).toBe("2345");
  for (const range of [
    "bytes=99-",
    "bytes=-0",
    "bytes=4-2",
    "bytes=",
    "bytes=0-1,3-4",
  ]) {
    expect(
      (
        await serveMedia(
          new Request(segment, { headers: { range } }),
          env,
          context,
          cache,
        )
      ).status,
    ).toBe(416);
  }
  const suffix = await serveMedia(
    new Request(segment, { headers: { range: "bytes=-3" } }),
    env,
    context,
    cache,
  );
  expect(await suffix.text()).toBe("789");
  expect(
    (
      await serveMedia(
        new Request(segment, { headers: { origin: "https://other.example" } }),
        env,
        context,
        cache,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await serveMedia(
        new Request(segment, { method: "HEAD" }),
        env,
        context,
        cache,
      )
    ).headers.get("content-length"),
  ).toBe("10");
  await Promise.all(jobs);
});
