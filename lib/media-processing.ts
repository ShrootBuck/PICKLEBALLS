import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { encodeHls } from "@/lib/hls-encoding";
import { getPrisma } from "@/lib/prisma";
import { mediaDownloadUrl, putMedia, r2 } from "@/lib/r2";
import { encodeVideo, probeVideo, videoPoster } from "@/lib/video-encoding";

export async function processVideoMedia(id: string, signal: AbortSignal) {
  const prisma = getPrisma();
  const media = await prisma.mediaUpload.findUniqueOrThrow({ where: { id } });
  if (media.ready && media.hlsKey) {
    if (media.uploadId) await deleteVideoOriginal(id);
    return;
  }
  if (
    (!media.ready && !media.uploadedAt) ||
    !media.mimeType.startsWith("video/")
  )
    throw new Error("Video upload is incomplete.");
  const { client, bucket } = r2();
  const input = await mediaDownloadUrl(
    media.objectKey,
    media.mimeType,
    48 * 3600,
  );
  await prisma.mediaUpload.updateMany({
    where: { id, objectKey: media.objectKey, hlsKey: null },
    data: { processingError: null, progress: 0 },
  });
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  const prefix = `media/${id}/${randomUUID()}`;
  const key = `${prefix}/video.mp4`;
  const posterKey = `${prefix}/poster.webp`;
  const hlsKey = `${prefix}/hls/master.m3u8`;
  const writtenKeys = new Set([key, posterKey]);
  let published = false;
  try {
    const info = await probeVideo(input, combined);
    const poster = await videoPoster(input, info, combined);
    await putMedia(posterKey, poster, "image/webp", combined);
    let lastProgress = -1;
    let lastWrite = 0;
    let progressWrite = Promise.resolve();
    const reportProgress = (progress: number) => {
      if (progress === lastProgress || Date.now() - lastWrite < 2000) return;
      lastProgress = progress;
      lastWrite = Date.now();
      progressWrite = progressWrite
        .then(async () => {
          await prisma.mediaUpload.updateMany({
            where: { id, objectKey: media.objectKey },
            data: { progress },
          });
        })
        .catch(() => {});
    };
    const encoded = encodeVideo(input, info, combined, (progress) =>
      reportProgress(Math.floor(progress * 0.6)),
    );
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
    await encodeHls(
      await mediaDownloadUrl(key, "video/mp4", 48 * 3600),
      verified,
      combined,
      async (name, bytes, contentType) => {
        const assetKey = `${prefix}/hls/${name}`;
        writtenKeys.add(assetKey);
        await putMedia(assetKey, bytes, contentType, combined);
      },
      (progress) => reportProgress(60 + Math.floor(progress * 0.39)),
    );
    await progressWrite;
    combined.throwIfAborted();
    const saved = await prisma.mediaUpload.updateMany({
      where: { id, objectKey: media.objectKey, hlsKey: null },
      data: {
        ready: true,
        objectKey: key,
        posterKey,
        hlsKey,
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
      if (current && current.objectKey !== key) {
        const keys = [...writtenKeys];
        for (let index = 0; index < keys.length; index += 16)
          await Promise.allSettled(
            keys
              .slice(index, index + 16)
              .map((Key) =>
                client.send(new DeleteObjectCommand({ Bucket: bucket, Key })),
              ),
          );
      }
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
