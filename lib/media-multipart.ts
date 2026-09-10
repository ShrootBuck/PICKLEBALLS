import {
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { MediaUpload } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { mediaPartBytes, uploadLifetimeMs } from "@/lib/media-policy";
import { r2 } from "@/lib/r2";

export function assertUploadOpen(media: MediaUpload) {
  if (
    media.ready ||
    media.uploadedAt ||
    Date.now() - media.createdAt.getTime() > uploadLifetimeMs
  )
    throw new DomainError("This upload is closed. Choose the file again.", 409);
}

export async function signMediaPart(media: MediaUpload, part: number) {
  assertUploadOpen(media);
  const size = Number(media.sizeBytes);
  if (
    !media.uploadId ||
    !Number.isInteger(part) ||
    part < 1 ||
    part > Math.ceil(size / mediaPartBytes)
  )
    throw new DomainError("Invalid upload part.");
  const { client, bucket } = r2();
  return getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: bucket,
      Key: media.objectKey,
      UploadId: media.uploadId,
      PartNumber: part,
      ContentLength: Math.min(
        mediaPartBytes,
        size - (part - 1) * mediaPartBytes,
      ),
    }),
    { expiresIn: 3600 },
  );
}

// Read the manifest from storage, never trust sizes or ETags supplied by the browser.
export async function completeMediaUpload(media: MediaUpload) {
  const { client, bucket } = r2();
  const input = { Bucket: bucket, Key: media.objectKey };
  try {
    const object = await client.send(new HeadObjectCommand(input));
    if (BigInt(object.ContentLength ?? -1) !== media.sizeBytes)
      throw new DomainError("Incomplete upload. Try again.");
    return;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !["NotFound", "NoSuchKey"].includes(error.name)
    )
      throw error;
  }
  if (!media.uploadId) throw new DomainError("Upload not found.");
  const listed = await client.send(
    new ListPartsCommand({
      ...input,
      UploadId: media.uploadId,
      MaxParts: 1000,
    }),
  );
  const parts = listed.Parts ?? [];
  const size = Number(media.sizeBytes);
  if (
    listed.IsTruncated ||
    parts.length !== Math.ceil(size / mediaPartBytes) ||
    parts.some(
      (part, i) =>
        !part.ETag ||
        part.PartNumber !== i + 1 ||
        part.Size !== Math.min(mediaPartBytes, size - i * mediaPartBytes),
    )
  )
    throw new DomainError("Some video chunks are missing. Retry the upload.");
  try {
    await client.send(
      new CompleteMultipartUploadCommand({
        ...input,
        UploadId: media.uploadId,
        MultipartUpload: {
          Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })),
        },
      }),
    );
  } catch (error) {
    // A concurrent finalize or a lost completion response can already have sealed the upload.
    const object = await client
      .send(new HeadObjectCommand(input))
      .catch(() => null);
    if (BigInt(object?.ContentLength ?? -1) !== media.sizeBytes) throw error;
  }
  const object = await client.send(new HeadObjectCommand(input));
  if (BigInt(object.ContentLength ?? -1) !== media.sizeBytes)
    throw new DomainError("Incomplete upload. Try again.");
}
