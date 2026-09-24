import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { stat, writeFile } from "node:fs/promises";
import { getPrisma } from "@/lib/prisma";
import { encodeVideo, probeVideo, videoPoster } from "@/lib/video-encoding";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "").hostname !== "127.0.0.1"
)
  throw new Error("Disposable fixtures only.");
const input = "/private/tmp/pb-video-fixture-source.mp4";
const result = spawnSync("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=720x1280:rate=24",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=330:sample_rate=48000",
  "-t",
  "12",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-c:a",
  "aac",
  input,
]);
if (result.status)
  throw new Error("Install ffmpeg to generate video fixtures.");
const info = await probeVideo(input);
const controller = new AbortController();
const output = "/private/tmp/pb-video-fixture.mp4";
await encodeVideo(input, output, info, controller.signal, () => {});
const { size } = await stat(output);
await writeFile(
  "/private/tmp/pb-video-fixture.webp",
  await videoPoster(input, info, controller.signal),
);
const prisma = getPrisma();
const ids: string[] = [];
for (let i = 0; i < 2; i++) {
  const id = `v_${randomUUID()}`;
  await prisma.mediaUpload.create({
    data: {
      id,
      ownerId: "demo-eddie",
      circleId: "demo-circle",
      mimeType: "video/mp4",
      sizeBytes: size,
      objectKey: `fixture-video-${i}`,
      posterKey: "fixture-video-poster",
      duration: info.duration,
      ready: true,
      claimed: true,
      progress: 100,
    },
  });
  ids.push(id);
}
await prisma.taskProof.update({
  where: { id: "demo-proof-0" },
  data: { mediaIds: ids },
});
await prisma.$disconnect();
