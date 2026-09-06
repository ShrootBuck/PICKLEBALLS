import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(
  new URL("../../public/sw.js", import.meta.url),
  "utf8",
);

function worker(response: Response, unavailable = false) {
  let handler: (event: unknown) => void;
  let requests = 0;
  const stored = new Map<string, Response>();
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://example.com" },
      addEventListener: (name: string, callback: typeof handler) => {
        if (name === "fetch") handler = callback;
      },
    },
    caches: {
      open: async () => {
        if (unavailable) throw new Error("Storage unavailable");
        return {
          match: async (request: Request) => stored.get(request.url)?.clone(),
          put: async (request: Request, value: Response) => {
            stored.set(request.url, value);
          },
        };
      },
    },
    fetch: async () => {
      requests++;
      return response.clone();
    },
  });
  return {
    get requests() {
      return requests;
    },
    load(path: string, init?: RequestInit) {
      let result: Promise<Response> | undefined;
      handler({
        request: new Request(`https://example.com${path}`, init),
        respondWith: (value: Promise<Response>) => {
          result = value;
        },
      });
      return result;
    },
  };
}

describe("device image cache", () => {
  for (const path of [
    "/api/media/photo_123",
    "/api/proofs/proof_123/image",
    "/api/avatar?src=one",
  ]) {
    test(`reuses downloaded bytes for ${path}`, async () => {
      const cache = worker(
        new Response("photo", { headers: { "content-type": "image/webp" } }),
      );
      expect(await (await cache.load(path))?.text()).toBe("photo");
      expect(await (await cache.load(path))?.text()).toBe("photo");
      expect(cache.requests).toBe(1);
    });
  }
  test("does not cache errors or non-images", async () => {
    for (const response of [
      new Response("missing", { status: 404 }),
      new Response("video", { headers: { "content-type": "video/mp4" } }),
    ]) {
      const cache = worker(response);
      await cache.load("/api/media/photo_123");
      await cache.load("/api/media/photo_123");
      expect(cache.requests).toBe(2);
    }
  });
  test("ignores videos, partial requests, and pages", () => {
    const cache = worker(new Response("unused"));
    expect(cache.load("/api/media/v_123")).toBeUndefined();
    expect(cache.load("/squad")).toBeUndefined();
    expect(
      cache.load("/api/media/photo_123", { headers: { range: "bytes=0-10" } }),
    ).toBeUndefined();
  });
  test("still displays images when storage is unavailable", async () => {
    const cache = worker(
      new Response("photo", { headers: { "content-type": "image/webp" } }),
      true,
    );
    expect(await (await cache.load("/api/media/photo_123"))?.text()).toBe(
      "photo",
    );
  });
});
