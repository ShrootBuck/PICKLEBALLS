import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import sharp from "sharp";

export type VideoInfo = {
  duration: number;
  width: number;
  height: number;
  hdr: boolean;
  fps: number;
};
const networkArgs = [
  "-format_whitelist",
  "mov,matroska,webm,avi,mpeg,mpegts",
  "-protocol_whitelist",
  "file,http,https,tcp,tls,crypto",
  "-rw_timeout",
  "60000000",
];

// Keep subprocess diagnostics out of task logs: input URLs carry storage credentials.
function processExit(child: ReturnType<typeof spawn>, label: string) {
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
  filters.push("scale=w=trunc(iw*sar/2)*2:h=ih", "setsar=1");
  // FFmpeg autorotates before filtering. Fit landscape or portrait without cropping or enlargement.
  filters.push(
    "scale=w='if(gte(iw,ih),min(1920,iw),min(1080,iw))':h='if(gte(iw,ih),min(1080,ih),min(1920,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "setsar=1",
  );
  if (info.fps > 60) filters.push("fps=60");
  filters.push("format=yuv420p");
  return filters.join(",");
}

export function encodeVideo(
  input: string,
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
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-maxrate",
      "8M",
      "-bufsize",
      "16M",
      "-threads",
      "2",
      "-force_key_frames",
      "expr:gte(t,n_forced*2)",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ac",
      "2",
      "-movflags",
      "+frag_keyframe+empty_moov+default_base_moof",
      "-f",
      "mp4",
      "-progress",
      "pipe:2",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"], signal },
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
  return {
    stream: child.stdout as Readable,
    done: processExit(child, "Video encoding"),
  };
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
