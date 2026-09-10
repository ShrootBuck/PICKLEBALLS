import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getPrisma } from "@/lib/prisma";
import { mediaDownloadUrl, putMedia, r2 } from "@/lib/r2";
import { encodeVideo, probeVideo, videoPoster } from "@/lib/video-encoding";

export async function processVideoMedia(id: string, signal: AbortSignal) {
  const prisma = getPrisma();
  const media = await prisma.mediaUpload.findUniqueOrThrow({ where: { id } });
  if (media.ready) {
    if (media.uploadId) await deleteVideoOriginal(id);
    return;
  }
  if (!media.uploadedAt || !media.mimeType.startsWith("video/"))
    throw new Error("Video upload is incomplete.");
  const { client, bucket } = r2();
  const input = await mediaDownloadUrl(
    media.objectKey,
    media.mimeType,
    48 * 3600,
  );
  await prisma.mediaUpload.update({
    where: { id },
    data: { processingError: null, progress: 0 },
  });
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const key = `media/${id}/${randomUUID()}.mp4`;
  const posterKey = `media/${id}/${randomUUID()}.webp`;
  let published = false;
  try {
    const info = await probeVideo(input, combined);
    const poster = await videoPoster(input, info, combined);
    await putMedia(posterKey, poster, "image/webp");
    let lastProgress = -1;
    let lastWrite = 0;
    let progressWrite = Promise.resolve();
    const encoded = encodeVideo(input, info, combined, (progress) => {
      if (progress === lastProgress || Date.now() - lastWrite < 2000) return;
      lastProgress = progress;
      lastWrite = Date.now();
      progressWrite = progressWrite
        .then(async () => {
          await prisma.mediaUpload.updateMany({
            where: { id, ready: false },
            data: { progress },
          });
        })
        .catch(() => {});
    });
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: encoded.stream,
        ContentType: "video/mp4",
      },
      partSize: 16 * 1024 * 1024,
      queueSize: 2,
      leavePartsOnError: false,
    });
    try {
      await Promise.all([encoded.done, upload.done()]);
    } catch (error) {
      controller.abort();
      await upload.abort().catch(() => {});
      await encoded.done.catch(() => {});
      throw error;
    }
    await progressWrite;
    const result = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!result.ContentLength) throw new Error("Encoded video is empty.");
    // Read the uploaded result before switching the DB pointer or deleting the source.
    const verified = await probeVideo(
      await mediaDownloadUrl(key, "video/mp4"),
      combined,
    );
    if (Math.abs(verified.duration - info.duration) > 2)
      throw new Error(
        "Encoded video is incomplete. Original retained for retry.",
      );
    const saved = await prisma.mediaUpload.updateMany({
      where: { id, ready: false, objectKey: media.objectKey },
      data: {
        ready: true,
        objectKey: key,
        posterKey,
        mimeType: "video/mp4",
        sizeBytes: BigInt(result.ContentLength),
        duration: verified.duration,
        progress: 100,
        processingError: null,
      },
    });
    published = saved.count === 1;
    if (published) {
      await deleteVideoOriginal(id);
    }
  } finally {
    controller.abort();
    if (!published) {
      // A lost DB acknowledgement may mean the update committed. Never delete a referenced result.
      const current = await prisma.mediaUpload
        .findUnique({ where: { id }, select: { objectKey: true } })
        .catch(() => null);
      if (current && current.objectKey !== key)
        await Promise.allSettled(
          [key, posterKey].map((Key) =>
            client.send(new DeleteObjectCommand({ Bucket: bucket, Key })),
          ),
        );
    }
  }
}

export async function deleteVideoOriginal(id: string) {
  const media = await getPrisma().mediaUpload.findUniqueOrThrow({
    where: { id },
  });
  if (!media.ready || !media.uploadId) return;
  const { client, bucket } = r2();
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: `staging/${id}` }),
  );
  await getPrisma().mediaUpload.updateMany({
    where: { id, ready: true },
    data: { uploadId: null },
  });
}
