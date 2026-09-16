import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hlsAssetName, hlsContentType, readHlsSegments } from "@/lib/hls";
import { networkArgs, processExit, type VideoInfo } from "@/lib/video-encoding";

export function videoRenditions(info: VideoInfo) {
  const shortEdge = Math.min(info.width, info.height);
  return [...[360, 720].filter((size) => size < shortEdge), shortEdge].map(
    (size, index) => {
      const scale = size / shortEdge;
      return {
        name: `v${index}`,
        width: Math.max(2, Math.floor((info.width * scale) / 2) * 2),
        height: Math.max(2, Math.floor((info.height * scale) / 2) * 2),
        copy: size === shortEdge,
        bitrate: size <= 360 ? 800_000 : 2_500_000,
      };
    },
  );
}

// Completed segments are atomically renamed out of .tmp by FFmpeg. Pause the
// producer while uploading each batch so slow storage cannot fill worker disk.
// Only a few bounded segments are buffered, not a complete rendition/video.
// Input must be our normalized H.264/AAC MP4 with two-second closed GOPs.
export async function encodeHls(
  input: string,
  info: VideoInfo,
  signal: AbortSignal,
  save: (name: string, bytes: Buffer, contentType: string) => Promise<void>,
  onProgress: (percent: number) => void = () => {},
) {
  signal.throwIfAborted();
  const renditions = videoRenditions(info);
  const sizes = new Map<string, number>();
  const directory = await mkdtemp(join(tmpdir(), "pb-hls-"));
  let child: ReturnType<typeof spawn> | undefined;
  let closed = Promise.resolve();
  try {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      ...networkArgs,
      "-i",
      input,
    ];
    for (const rendition of renditions) {
      args.push(
        "-map",
        "0:V:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
      );
      if (rendition.copy) args.push("-c", "copy");
      else
        args.push(
          "-vf",
          `scale=${rendition.width}:${rendition.height},setsar=1,fps=${Math.min(30, info.fps)}`,
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-profile:v",
          "high",
          "-level:v",
          "4.2",
          "-pix_fmt",
          "yuv420p",
          "-maxrate",
          String(rendition.bitrate),
          "-bufsize",
          String(rendition.bitrate * 2),
          "-threads",
          "2",
          "-flags",
          "+cgop",
          "-sc_threshold",
          "0",
          "-force_key_frames",
          "expr:gte(t,n_forced*2)",
          "-c:a",
          "copy",
        );
      args.push(
        "-f",
        "hls",
        "-hls_time",
        "2",
        "-hls_playlist_type",
        "vod",
        "-hls_flags",
        "independent_segments+temp_file",
        "-hls_segment_type",
        "mpegts",
        "-hls_segment_filename",
        join(directory, `${rendition.name}_%06d.ts`),
        join(directory, `${rendition.name}.m3u8`),
      );
    }
    args.push("-progress", "pipe:2");
    child = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
      signal,
    });
    closed = new Promise<void>((resolve) =>
      child?.once("close", () => resolve()),
    );
    let finished = false;
    let encodingError: unknown;
    const encoding = processExit(child, "Adaptive video encoding").then(
      () => {
        finished = true;
      },
      (error) => {
        encodingError = error;
        finished = true;
      },
    );
    let pending = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop()?.slice(-4096) ?? "";
      for (const line of lines)
        if (line.startsWith("out_time_us=")) {
          const percent =
            (Number(line.slice(12)) / 1_000_000 / info.duration) * 100;
          if (Number.isFinite(percent))
            onProgress(Math.max(0, Math.min(99, Math.floor(percent))));
        }
    });
    // SIGSTOP/SIGCONT are supported on the Linux worker and local macOS. Each
    // pass pauses before any network await. Completed files are never read while
    // FFmpeg is writing them. The .tmp file is deliberately ignored.
    for (;;) {
      signal.throwIfAborted();
      const endedAtStart = finished;
      const files = (await readdir(directory)).filter((name) =>
        name.endsWith(".ts"),
      );
      if (files.length) {
        child.kill("SIGSTOP");
        try {
          for (let index = 0; index < files.length; index += 3) {
            const writes = await Promise.allSettled(
              files.slice(index, index + 3).map(async (name) => {
                if (!hlsAssetName.test(name))
                  throw new Error("Unexpected video segment.");
                const path = join(directory, name);
                const size = (await stat(path)).size;
                if (!size || size > 16 * 1024 * 1024)
                  throw new Error("Invalid video segment size.");
                await save(name, await readFile(path), "video/mp2t");
                sizes.set(name, size);
                await unlink(path);
              }),
            );
            if (writes.some((result) => result.status === "rejected"))
              throw new Error("Could not store video segments.");
          }
        } finally {
          child.kill("SIGCONT");
        }
      }
      signal.throwIfAborted();
      if (endedAtStart) break;
      await delay(75, undefined, { signal });
    }
    await encoding;
    if (encodingError) throw encodingError;
    const master = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-INDEPENDENT-SEGMENTS",
    ];
    for (const rendition of renditions) {
      signal.throwIfAborted();
      const name = `${rendition.name}.m3u8`;
      const playlist = await readFile(join(directory, name), "utf8");
      const segments = readHlsSegments(playlist);
      let duration = 0,
        totalBytes = 0,
        peak = 0;
      for (const segment of segments) {
        const size = sizes.get(segment.name);
        if (!size) throw new Error("Missing video segment.");
        totalBytes += size;
        duration += segment.duration;
        peak = Math.max(peak, (size * 8) / segment.duration);
      }
      if (Math.abs(duration - info.duration) > 2)
        throw new Error("Incomplete adaptive video.");
      // Measure the actual muxed bandwidth, including audio and transport overhead.
      master.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil(peak * 1.1)},AVERAGE-BANDWIDTH=${Math.ceil((totalBytes * 8) / duration)},RESOLUTION=${rendition.width}x${rendition.height}`,
      );
      master.push(name);
      await save(name, Buffer.from(playlist), hlsContentType);
    }
    signal.throwIfAborted();
    await save(
      "master.m3u8",
      Buffer.from(`${master.join("\n")}\n`),
      hlsContentType,
    );
    signal.throwIfAborted();
  } finally {
    if (child && child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
}
