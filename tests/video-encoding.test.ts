import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  {
    name: "landscape",
    size: "2560x1440",
    rate: 10,
    audio: true,
    rotation: false,
    output: [2560, 1440],
  },
  {
    name: "high-frame-rate",
    size: "1920x1080",
    rate: 240,
    audio: false,
    rotation: false,
    output: [1920, 1080],
  },
  {
    name: "portrait-silent",
    size: "240x320",
    rate: 10,
    audio: false,
    rotation: false,
    output: [240, 320],
  },
  {
    name: "rotated-camera",
    size: "320x240",
    rate: 10,
    audio: false,
    rotation: true,
    output: [240, 320],
  },
])
  test.skipIf(!available)(
    `encodes ${fixture.name}, preserves resolution, frames and duration, supports seeking, and creates a poster`,
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
        `testsrc2=size=${fixture.size}:rate=${fixture.rate}`,
      ];
      if (fixture.audio)
        args.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000");
      args.push(
        "-t",
        fixture.rate > 60 ? "2" : "6.4",
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
      const output = join(directory, `${fixture.name}-encoded.mp4`);
      await encodeVideo(input, output, info, controller.signal, () => {});
      const bytes = await readFile(output);
      const result = await probeVideo(output);
      expect(Math.abs(result.duration - info.duration)).toBeLessThan(0.3);
      expect([result.width, result.height]).toEqual(fixture.output);
      expect(Math.round(result.fps)).toBe(fixture.rate);
      const frames = spawnSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-count_frames",
        "-show_entries",
        "stream=nb_read_frames",
        "-of",
        "csv=p=0",
        output,
      ]);
      expect(Number(frames.stdout.toString().trim())).toBe(
        Math.round(info.duration * fixture.rate),
      );
      // Faststart: the index precedes the media so browsers can seek immediately.
      expect(bytes.indexOf(Buffer.from("moov"))).toBeLessThan(
        bytes.indexOf(Buffer.from("mdat")),
      );
      expect(bytes.includes(Buffer.from("moof"))).toBe(false);
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
      const cancelled = new AbortController();
      cancelled.abort();
      await expect(
        encodeVideo(
          input,
          join(directory, `${fixture.name}-cancelled.mp4`),
          info,
          cancelled.signal,
          () => {},
        ),
      ).rejects.toThrow();
    },
    120_000,
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
