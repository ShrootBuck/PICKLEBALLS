import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { task } from "@trigger.dev/sdk";
import { getPrisma } from "@/lib/prisma";
import { r2 } from "@/lib/r2";

const exec = promisify(execFile);
// Read-only production smoke test. No media uploads, posts, AI calls, or notifications.
export const mediaHealthCheck = task({
  id: "media-health-check",
  maxDuration: 60,
  run: async () => {
    const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    const [{ stdout: filters }, { stdout: encoders }] = await Promise.all([
      exec(ffmpeg, ["-hide_banner", "-filters"]),
      exec(ffmpeg, ["-hide_banner", "-encoders"]),
      exec(process.env.FFPROBE_PATH || "ffprobe", ["-version"]),
    ]);
    for (const filter of ["zscale", "tonemap", "scale"])
      if (!filters.includes(filter))
        throw new Error(`Missing video filter: ${filter}`);
    for (const encoder of ["libx264", "aac", "png"])
      if (!encoders.includes(encoder))
        throw new Error(`Missing video encoder: ${encoder}`);
    await getPrisma()
      .$queryRaw`SELECT "duration", "uploadId", "pendingProofId" FROM "MediaUpload" LIMIT 0`;
    await getPrisma().$queryRaw`SELECT "proofId" FROM "PendingProof" LIMIT 0`;
    const { client, bucket } = r2();
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL as string).origin;
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: "staging/health-check",
        ContentType: "video/mp4",
      }),
      { expiresIn: 60 },
    );
    const preflight = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const allowedOrigin = preflight.headers.get("access-control-allow-origin");
    const browserUploads =
      preflight.ok && (allowedOrigin === "*" || allowedOrigin === origin);
    if (!browserUploads)
      throw new Error("R2 CORS does not allow app uploads and playback.");
    return {
      ok: true,
      ffmpeg: true,
      hdr: true,
      schema: true,
      browserUploads: true,
    };
  },
});
