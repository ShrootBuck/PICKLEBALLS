import { spawn } from "node:child_process";
import sharp from "sharp";

export type VideoInfo = {
  duration: number;
  width: number;
  height: number;
  hdr: boolean;
  fps: number;
};
export const networkArgs = [
  "-format_whitelist",
  "mov,matroska,webm,avi,mpeg,mpegts",
  "-protocol_whitelist",
  "file,http,https,tcp,tls,crypto",
  "-rw_timeout",
  "60000000",
];

// Keep subprocess diagnostics out of task logs: input URLs carry storage credentials.
export function processExit(child: ReturnType<typeof spawn>, label: string) {
  return new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error(`${label} could not start.`)));
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${label} failed. The video may be damaged or unsupported.`,
            ),
          ),
    );
  });
}

export async function probeVideo(
  input: string,
  signal?: AbortSignal,
): Promise<VideoInfo> {
  const child = spawn(
    process.env.FFPROBE_PATH || "ffprobe",
    [
      "-v",
      "error",
      ...networkArgs,
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      input,
    ],
    { stdio: ["ignore", "pipe", "ignore"], signal },
  );
  const done = processExit(child, "Video inspection");
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    if (output.length > 1024 * 1024) child.kill("SIGKILL");
  });
  await done;
  const data = JSON.parse(output);
  const stream = data.streams?.find(
    (s: { codec_type?: string; disposition?: { attached_pic?: number } }) =>
      s.codec_type === "video" && !s.disposition?.attached_pic,
  );
  const duration = Number(data.format?.duration ?? stream?.duration);
  if (
    !stream ||
    !(stream.width > 0) ||
    !(stream.height > 0) ||
    !(duration > 0) ||
    !Number.isFinite(duration)
  )
    throw new Error("Could not read a playable video and its duration.");
  const [num, den] = String(stream.avg_frame_rate || "30/1")
    .split("/")
    .map(Number);
  return {
    duration,
    width: stream.width,
    height: stream.height,
    hdr: ["smpte2084", "arib-std-b67"].includes(stream.color_transfer),
    fps: num / den || 30,
  };
}

export function videoFilters(info: VideoInfo) {
  const filters = [];
  if (info.hdr)
    filters.push(
      "zscale=t=linear:npl=100",
      "format=gbrpf32le",
      "zscale=p=bt709",
      "tonemap=tonemap=hable:desat=0",
      "zscale=t=bt709:m=bt709:r=tv",
    );
  // FFmpeg autorotates before filtering. Square pixels and even dimensions are
  // required for browser-compatible 4:2:0 H.264; resolution is otherwise kept.
  filters.push(
    "scale=w=trunc(iw*sar/2)*2:h=trunc(ih/2)*2",
    "setsar=1",
    "format=yuv420p",
  );
  return filters.join(",");
}

// Resolution, frame rate and frame timing pass through. x264 chooses quality,
// profile, level and keyframes itself within a 10 Mbps video ceiling.
export function encodeVideo(
  input: string,
  output: string,
  info: VideoInfo,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
) {
  const child = spawn(
    process.env.FFMPEG_PATH || "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      ...networkArgs,
      "-i",
      input,
      "-map",
      "0:V:0",
      "-map",
      "0:a:0?",
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-vf",
      videoFilters(info),
      "-fps_mode",
      "passthrough",
      "-c:v",
      "libx264",
      "-maxrate",
      "10M",
      "-bufsize",
      "20M",
      // Matches the worker's vCPUs; x264 would otherwise size threads from the host.
      "-threads",
      "4",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      // A front-loaded index lets browsers start and seek before downloading the file.
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      "-progress",
      "pipe:2",
      "-y",
      output,
    ],
    { stdio: ["ignore", "ignore", "pipe"], signal },
  );
  let pending = "";
  child.stderr.on("data", (chunk: Buffer) => {
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop()?.slice(-4096) ?? "";
    for (const line of lines)
      if (line.startsWith("out_time_us=")) {
        const seconds = Number(line.slice(12)) / 1_000_000;
        if (Number.isFinite(seconds))
          onProgress(
            Math.max(
              0,
              Math.min(99, Math.floor((seconds / info.duration) * 100)),
            ),
          );
      }
  });
  return processExit(child, "Video encoding");
}

export async function videoPoster(
  input: string,
  info: VideoInfo,
  signal: AbortSignal,
) {
  const child = spawn(
    process.env.FFMPEG_PATH || "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      ...networkArgs,
      "-i",
      input,
      "-map",
      "0:V:0",
      "-frames:v",
      "1",
      "-vf",
      `${videoFilters(info)},scale=640:640:force_original_aspect_ratio=decrease`,
      "-c:v",
      "png",
      "-f",
      "image2pipe",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "ignore"], signal },
  );
  const done = processExit(child, "Video preview");
  const chunks: Buffer[] = [];
  let size = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) child.kill("SIGKILL");
    else chunks.push(chunk);
  });
  await done;
  if (!size) throw new Error("Could not create a video preview.");
  return sharp(Buffer.concat(chunks)).webp({ quality: 82 }).toBuffer();
}
