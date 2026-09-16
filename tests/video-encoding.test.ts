import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHlsSegments } from "@/lib/hls";
import { encodeHls, videoRenditions } from "@/lib/hls-encoding";
import {
  maxVideoBytes,
  mediaMimeType,
  uploadTicketSchema,
} from "@/lib/media-policy";
import { encodeVideo, probeVideo, videoPoster } from "@/lib/video-encoding";

const available =
  spawnSync("ffmpeg", ["-version"]).status === 0 &&
  spawnSync("ffprobe", ["-version"]).status === 0;
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "pb-video-test-"));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

test("video limits accept 5 GB exactly and normalize common camera/container extensions", () => {
  expect(
    uploadTicketSchema.safeParse({
      mimeType: "video/mp4",
      sizeBytes: maxVideoBytes,
    }).success,
  ).toBe(true);
  expect(
    uploadTicketSchema.safeParse({
      mimeType: "video/mp4",
      sizeBytes: maxVideoBytes + 1,
    }).success,
  ).toBe(false);
  expect(
    uploadTicketSchema.safeParse({
      mimeType: "image/jpeg",
      sizeBytes: maxVideoBytes,
    }).success,
  ).toBe(false);
  expect(
    mediaMimeType({ name: "Eddie.MKV", type: "application/octet-stream" }),
  ).toBe("video/x-matroska");
});

for (const fixture of [
  { name: "landscape", size: "2560x1440", audio: true, rotation: false },
  { name: "portrait-silent", size: "240x320", audio: false, rotation: false },
  { name: "rotated-camera", size: "320x240", audio: false, rotation: true },
])
  test.skipIf(!available)(
    `encodes ${fixture.name}, preserves duration, supports seeking, and creates a poster`,
    async () => {
      const original = join(directory, `${fixture.name}-original.mp4`);
      const input = join(directory, `${fixture.name}.mp4`);
      const args = [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=${fixture.size}:rate=10`,
      ];
      if (fixture.audio)
        args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000");
      args.push(
        "-t",
        "6.4",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
      );
      if (fixture.audio) args.push("-c:a", "aac");
      args.push(fixture.rotation ? original : input);
      expect(spawnSync("ffmpeg", args).status).toBe(0);
      if (fixture.rotation)
        expect(
          spawnSync("ffmpeg", [
            "-v",
            "error",
            "-display_rotation",
            "90",
            "-i",
            original,
            "-c",
            "copy",
            input,
          ]).status,
        ).toBe(0);
      const info = await probeVideo(input);
      const controller = new AbortController();
      const encoded = encodeVideo(input, info, controller.signal, () => {});
      const chunks: Buffer[] = [];
      encoded.stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      await encoded.done;
      const bytes = Buffer.concat(chunks);
      const output = join(directory, `${fixture.name}-encoded.mp4`);
      await writeFile(output, bytes);
      const result = await probeVideo(output);
      expect(Math.abs(result.duration - info.duration)).toBeLessThan(0.3);
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1920);
      expect(Math.min(result.width, result.height)).toBeLessThanOrEqual(1080);
      if (fixture.name !== "landscape")
        expect(result.height).toBeGreaterThan(result.width);
      expect(bytes.indexOf(Buffer.from("moov"))).toBeLessThan(
        bytes.indexOf(Buffer.from("mdat")),
      );
      expect(bytes.includes(Buffer.from("moof"))).toBe(true);
      expect(
        spawnSync("ffmpeg", [
          "-v",
          "error",
          "-ss",
          "1",
          "-i",
          output,
          "-frames:v",
          "1",
          "-f",
          "null",
          "-",
        ]).status,
      ).toBe(0);
      const poster = await videoPoster(input, info, controller.signal);
      expect(poster.subarray(8, 12).toString()).toBe("WEBP");
      const assets = new Map<string, Buffer>();
      await encodeHls(
        output,
        result,
        controller.signal,
        async (name, bytes) => {
          assets.set(name, bytes);
          await writeFile(join(directory, name), bytes);
        },
      );
      expect(assets.has("master.m3u8")).toBe(true);
      for (const rendition of videoRenditions(result)) {
        const playlist = assets.get(`${rendition.name}.m3u8`)?.toString() ?? "";
        const segments = readHlsSegments(playlist);
        expect(segments.length).toBeGreaterThanOrEqual(3);
        expect(
          Math.abs(
            segments.reduce((sum, segment) => sum + segment.duration, 0) -
              result.duration,
          ),
        ).toBeLessThan(0.4);
        // Every segment must decode on its own, including one reached by seeking.
        for (const segment of segments) {
          expect(assets.has(segment.name)).toBe(true);
          const decoded = spawnSync("ffmpeg", [
            "-v",
            "error",
            "-xerror",
            "-i",
            join(directory, segment.name),
            "-f",
            "null",
            "-",
          ]);
          expect(decoded.status).toBe(0);
        }
        expect(
          spawnSync("ffmpeg", [
            "-v",
            "error",
            "-ss",
            "4",
            "-i",
            join(directory, `${rendition.name}.m3u8`),
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
          ]).status,
        ).toBe(0);
      }
      // A failed storage write must fail the rendition set, never publish a master.
      let published = false;
      await expect(
        encodeHls(output, result, controller.signal, async (name) => {
          if (name === "master.m3u8") published = true;
          throw new Error("storage unavailable");
        }),
      ).rejects.toThrow();
      expect(published).toBe(false);
      const cancelled = new AbortController();
      await expect(
        encodeHls(output, result, cancelled.signal, async () => {
          // Cancellation can arrive while the encoder is paused for a storage write.
          cancelled.abort();
        }),
      ).rejects.toThrow();
    },
    60_000,
  );

test.skipIf(!available)(
  "rejects invalid video data without exposing input URLs",
  async () => {
    const invalid = join(directory, "invalid.mp4");
    await writeFile(invalid, "not a video");
    await expect(probeVideo(invalid)).rejects.toThrow(
      "Video inspection failed",
    );
  },
);
