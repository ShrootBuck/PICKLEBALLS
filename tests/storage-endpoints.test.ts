import { afterEach, beforeEach, expect, test } from "bun:test";
import { mediaDownloadUrl, r2 } from "../lib/r2";

const names = [
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_REGION",
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "PB_TEST_R2_ENDPOINT",
  "PB_TEST_DATABASE",
];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
});
afterEach(() => {
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

test("Garage signs browser URLs publicly and worker URLs on the private network", async () => {
  Object.assign(process.env, {
    S3_ENDPOINT: "http://garage:3900",
    S3_PUBLIC_ENDPOINT: "https://media.example.com",
    S3_BUCKET: "media",
    S3_ACCESS_KEY_ID: "test-key",
    S3_SECRET_ACCESS_KEY: "test-secret",
  });
  const publicUrl = new URL(
    await mediaDownloadUrl("proof/a b.mp4", "video/mp4"),
  );
  const privateUrl = new URL(
    await mediaDownloadUrl("proof/a b.mp4", "video/mp4", 300, true),
  );
  expect(publicUrl.origin).toBe("https://media.example.com");
  expect(privateUrl.origin).toBe("http://garage:3900");
  expect(publicUrl.pathname).toBe("/media/proof/a%20b.mp4");
  expect(publicUrl.searchParams.get("X-Amz-Credential")).toContain(
    "/garage/s3/aws4_request",
  );
  expect(privateUrl.searchParams.get("X-Amz-Expires")).toBe("300");
  expect(publicUrl.searchParams.get("X-Amz-Signature")).not.toBe(
    privateUrl.searchParams.get("X-Amz-Signature"),
  );
});

test("existing R2 deployments retain their endpoint and signing region", async () => {
  Object.assign(process.env, {
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET: "media",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
  });
  const url = new URL(await mediaDownloadUrl("image.png", "image/png"));
  expect(url.origin).toBe("https://test-account.r2.cloudflarestorage.com");
  expect(url.searchParams.get("X-Amz-Credential")).toContain(
    "/auto/s3/aws4_request",
  );
  expect(r2().client).toBe(r2().publicClient);
});

test("partial S3 configuration never silently uses cloud storage credentials", () => {
  Object.assign(process.env, {
    S3_ENDPOINT: "http://garage:3900",
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET: "media",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
  });
  expect(() => r2()).toThrow("Media storage is not configured");
});

test("video playback URLs are stable until the stored object changes", async () => {
  const { playbackTicket } = await import("../lib/media-playback");
  const media = {
    id: "v_test",
    objectKey: "media/version1.mp4",
    mimeType: "video/mp4",
    duration: 10,
    posterKey: null,
  };
  const first = await playbackTicket(media);
  expect(first.url).toBe((await playbackTicket(media)).url);
  expect(first.url).not.toBe(
    (await playbackTicket({ ...media, objectKey: "media/version2.mp4" })).url,
  );
  expect(first.url).toStartWith("/api/media/v_test?v=");
});

test("video streaming preserves Safari ranges and private browser caching", async () => {
  const { videoResponse } = await import("../lib/r2");
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const headers = {
        etag: '"video-version"',
        "content-type": "video/mp4",
        "content-length": "4",
      };
      if (request.method === "HEAD") return new Response(null, { headers });
      const range = request.headers.get("range");
      if (range === "bytes=99-")
        return new Response("<Error><Code>InvalidRange</Code></Error>", {
          status: 416,
        });
      if (range === "bytes=0-1")
        return new Response("ab", {
          status: 206,
          headers: {
            ...headers,
            "content-length": "2",
            "content-range": "bytes 0-1/4",
          },
        });
      return new Response("abcd", { headers });
    },
  });
  Object.assign(process.env, {
    S3_ENDPOINT: `http://127.0.0.1:${server.port}`,
    S3_BUCKET: "media",
    S3_ACCESS_KEY_ID: "test",
    S3_SECRET_ACCESS_KEY: "test",
  });
  try {
    const request = (headers: Record<string, string>) =>
      new Request("https://example.com/api/media/v_test", { headers });
    const part = await videoResponse(
      "a.mp4",
      "video/mp4",
      request({ Range: "bytes=0-1" }),
      true,
    );
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 0-1/4");
    expect(part.headers.get("content-length")).toBe("2");
    expect(part.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable, no-transform",
    );
    expect(await part.text()).toBe("ab");
    const changed = await videoResponse(
      "a.mp4",
      "video/mp4",
      request({ Range: "bytes=0-1", "If-Range": '"old-version"' }),
      true,
    );
    expect(changed.status).toBe(200);
    expect(await changed.text()).toBe("abcd");
    const invalid = await videoResponse(
      "a.mp4",
      "video/mp4",
      request({ Range: "bytes=99-" }),
      true,
    );
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */4");
    expect(invalid.headers.get("cache-control")).toContain("no-store");
  } finally {
    server.stop(true);
  }
});
