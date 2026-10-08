import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { r2 } from "@/lib/r2";

// Repeat successful cleanup past the lifetime of signed uploads and encoders.
// Never expire a failed job. Keys stay private in this worker-only outbox.
export async function queueObjectDeletion(
  tx: Prisma.TransactionClient,
  key: string,
  prefix = false,
  uploadId?: string | null,
) {
  await tx.objectDeletion.upsert({
    where: { key },
    create: {
      key,
      prefix,
      uploadId,
      retryUntil: new Date(Date.now() + 3 * 86400_000),
    },
    update: {
      nextAttemptAt: new Date(),
      retryUntil: new Date(Date.now() + 3 * 86400_000),
      ...(uploadId ? { uploadId } : {}),
    },
  });
}

export async function deleteMediaRows(
  tx: Prisma.TransactionClient,
  where: Prisma.MediaUploadWhereInput,
) {
  const media = await tx.mediaUpload.findMany({ where });
  const entries = media.flatMap((item) => [
    { key: item.objectKey, prefix: false, uploadId: null as string | null },
    ...(item.posterKey
      ? [{ key: item.posterKey, prefix: false, uploadId: null }]
      : []),
    { key: `staging/${item.id}`, prefix: false, uploadId: item.uploadId },
    { key: `media/${item.id}/`, prefix: true, uploadId: null },
  ]);
  const unique = [
    ...new Map(entries.map((entry) => [entry.key, entry])).values(),
  ];
  const retryUntil = new Date(Date.now() + 3 * 86400_000);
  await tx.objectDeletion.createMany({
    data: unique.map((entry) => ({ ...entry, retryUntil })),
    skipDuplicates: true,
  });
  await tx.objectDeletion.updateMany({
    where: { key: { in: unique.map((entry) => entry.key) } },
    data: { nextAttemptAt: new Date(), retryUntil },
  });
  await tx.mediaUpload.deleteMany({ where });
}

export async function queueReplyMedia(
  tx: Prisma.TransactionClient,
  where: Prisma.SocialReplyWhereInput,
) {
  const replies = await tx.socialReply.findMany({
    where,
    select: { id: true, mediaIds: true },
  });
  await deleteMediaRows(tx, { id: { in: replies.flatMap((r) => r.mediaIds) } });
  const ids = replies.map((r) => r.id);
  await tx.activityEvent.deleteMany({ where: { entityId: { in: ids } } });
  await tx.notification.deleteMany({ where: { entityId: { in: ids } } });
}

export async function drainObjectDeletions(now = new Date()) {
  const prisma = getPrisma();
  const jobs = await prisma.objectDeletion.findMany({
    where: { nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: 50,
  });
  let failed = 0;
  for (const job of jobs) {
    try {
      const { client, bucket } = r2();
      if (job.uploadId) {
        try {
          await client.send(
            new AbortMultipartUploadCommand({
              Bucket: bucket,
              Key: job.key,
              UploadId: job.uploadId,
            }),
          );
        } catch (error) {
          if (!(error instanceof Error) || error.name !== "NoSuchUpload")
            throw error;
        }
      }
      if (job.prefix) {
        let token: string | undefined;
        do {
          const page = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: job.key,
              ContinuationToken: token,
            }),
          );
          for (const object of page.Contents ?? []) {
            if (object.Key)
              await client.send(
                new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }),
              );
          }
          token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
      } else {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: job.key }),
        );
      }
      // Compare the retry horizon so another deletion request cannot lose its job.
      const where = { key: job.key, retryUntil: job.retryUntil };
      if (job.retryUntil <= now)
        await prisma.objectDeletion.deleteMany({ where });
      else
        await prisma.objectDeletion.updateMany({
          where,
          data: {
            uploadId: null,
            nextAttemptAt: new Date(now.getTime() + 3600_000),
            attempts: { increment: 1 },
          },
        });
    } catch {
      failed++;
      await prisma.objectDeletion.updateMany({
        where: { key: job.key },
        data: {
          nextAttemptAt: new Date(
            now.getTime() +
              Math.min(3600_000, 60_000 * 2 ** Math.min(job.attempts, 6)),
          ),
          attempts: { increment: 1 },
        },
      });
    }
  }
  if (failed)
    console.warn(`${failed} file cleanup jobs failed and will retry.`);
  return { processed: jobs.length, failed };
}
