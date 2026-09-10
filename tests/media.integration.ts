import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "").hostname !== "127.0.0.1"
)
  throw new Error("Use bun run test:social.");
mock.module("server-only", () => ({}));
const { getPrisma } = await import("@/lib/prisma");
const { r2 } = await import("@/lib/r2");
const { completeMediaUpload, signMediaPart } = await import(
  "@/lib/media-multipart"
);
const { processVideoMedia } = await import("@/lib/media-processing");
const objects = new Map<string, { bytes: Uint8Array; type: string }>();
const uploads = new Map<string, Map<number, Uint8Array>>();
let failDelete = false;
const xml = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "application/xml" },
  });
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const key = url.pathname;
    const uploadId = url.searchParams.get("uploadId");
    if (request.method === "POST" && url.searchParams.has("uploads")) {
      const id = randomUUID();
      uploads.set(id, new Map());
      return xml(
        `<InitiateMultipartUploadResult><Bucket>media</Bucket><Key>${key.slice(7)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`,
      );
    }
    if (request.method === "PUT" && uploadId) {
      const parts = uploads.get(uploadId);
      if (!parts) return xml("<Error><Code>NoSuchUpload</Code></Error>", 404);
      parts.set(
        Number(url.searchParams.get("partNumber")),
        new Uint8Array(await request.arrayBuffer()),
      );
      return new Response(null, { headers: { etag: '"part"' } });
    }
    if (request.method === "GET" && uploadId) {
      const parts = uploads.get(uploadId);
      if (!parts) return xml("<Error><Code>NoSuchUpload</Code></Error>", 404);
      return xml(
        `<ListPartsResult><IsTruncated>false</IsTruncated>${[...parts]
          .sort(([a], [b]) => a - b)
          .map(
            ([part, bytes]) =>
              `<Part><PartNumber>${part}</PartNumber><ETag>"part"</ETag><Size>${bytes.length}</Size></Part>`,
          )
          .join("")}</ListPartsResult>`,
      );
    }
    if (request.method === "POST" && uploadId) {
      const parts = uploads.get(uploadId);
      if (!parts) return xml("<Error><Code>NoSuchUpload</Code></Error>", 404);
      objects.set(key, {
        bytes: Buffer.concat(
          [...parts]
            .sort(([a], [b]) => a - b)
            .map(([, bytes]) => Buffer.from(bytes)),
        ),
        type: "video/mp4",
      });
      uploads.delete(uploadId);
      return xml(
        '<CompleteMultipartUploadResult><ETag>"complete"</ETag></CompleteMultipartUploadResult>',
      );
    }
    if (request.method === "PUT") {
      objects.set(key, {
        bytes: new Uint8Array(await request.arrayBuffer()),
        type: request.headers.get("content-type") || "video/mp4",
      });
      return new Response(null, { headers: { etag: '"saved"' } });
    }
    if (request.method === "DELETE") {
      if (failDelete && key.includes("staging/"))
        return xml("<Error><Code>AccessDenied</Code></Error>", 403);
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const object = objects.get(key);
    if (!object) return xml("<Error><Code>NoSuchKey</Code></Error>", 404);
    const headers = {
      connection: "close",
      "content-type": object.type,
      "content-length": String(object.bytes.length),
      "accept-ranges": "bytes",
    };
    if (request.method === "HEAD") return new Response(null, { headers });
    const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]),
        end = range[2]
          ? Math.min(Number(range[2]), object.bytes.length - 1)
          : object.bytes.length - 1;
      return new Response(new Uint8Array(object.bytes.slice(start, end + 1)), {
        status: 206,
        headers: {
          ...headers,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${object.bytes.length}`,
        },
      });
    }
    return new Response(new Uint8Array(object.bytes), { headers });
  },
});
process.env.PB_TEST_R2_ENDPOINT = `http://127.0.0.1:${server.port}`;
const prisma = getPrisma();
let directory: string;
let bytes: Uint8Array;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "pb-media-integration-"));
  const input = join(directory, "input.mp4");
  expect(
    spawnSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=240x320:rate=12",
      "-t",
      "2",
      "-c:v",
      "libx264",
      input,
    ]).status,
  ).toBe(0);
  bytes = await readFile(input);
});
afterAll(async () => {
  server.stop(true);
  await prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
});

async function ticket(content: Uint8Array) {
  const id = `v_${randomUUID()}`,
    key = `staging/${id}`;
  const { client, bucket } = r2();
  const { UploadId } = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "video/mp4",
    }),
  );
  const media = await prisma.mediaUpload.create({
    data: {
      id,
      ownerId: "encoder-test",
      circleId: "encoder-test",
      mimeType: "video/mp4",
      sizeBytes: content.length,
      objectKey: key,
      uploadId: UploadId,
    },
  });
  await client.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId,
      PartNumber: 1,
      Body: content,
    }),
  );
  return media;
}

test("multipart completion verifies storage, tolerates repeated finalization, and encoding deletes only the successful original", async () => {
  const media = await ticket(bytes);
  const signed = new URL(await signMediaPart(media, 1));
  expect(signed.searchParams.get("uploadId")).toBe(media.uploadId);
  await expect(signMediaPart(media, 2)).rejects.toThrow("Invalid upload part");
  await completeMediaUpload(media);
  expect(
    Buffer.from(
      objects.get(`/media/${media.objectKey}`)?.bytes ?? new Uint8Array(),
    ).equals(Buffer.from(bytes)),
  ).toBe(true);
  await completeMediaUpload(media);
  await prisma.mediaUpload.update({
    where: { id: media.id },
    data: { uploadedAt: new Date() },
  });
  await processVideoMedia(media.id, new AbortController().signal);
  const encoded = await prisma.mediaUpload.findUniqueOrThrow({
    where: { id: media.id },
  });
  expect(encoded.ready).toBe(true);
  expect(encoded.duration).toBeGreaterThan(1.9);
  expect(objects.has(`/media/${encoded.objectKey}`)).toBe(true);
  expect(objects.has(`/media/${encoded.posterKey}`)).toBe(true);
  expect(objects.has(`/media/${media.objectKey}`)).toBe(false);
  await processVideoMedia(media.id, new AbortController().signal);
  expect(objects.has(`/media/${encoded.objectKey}`)).toBe(true);
}, 30_000);

test("invalid media retains its source for retry and never becomes ready", async () => {
  const media = await ticket(new TextEncoder().encode("invalid video"));
  await completeMediaUpload(media);
  await prisma.mediaUpload.update({
    where: { id: media.id },
    data: { uploadedAt: new Date() },
  });
  await expect(
    processVideoMedia(media.id, new AbortController().signal),
  ).rejects.toThrow();
  expect(
    (await prisma.mediaUpload.findUniqueOrThrow({ where: { id: media.id } }))
      .ready,
  ).toBe(false);
  expect(objects.has(`/media/${media.objectKey}`)).toBe(true);
});

test("retry cleans a source left after a failed deletion without deleting or re-encoding the published file", async () => {
  const media = await ticket(bytes);
  await completeMediaUpload(media);
  await prisma.mediaUpload.update({
    where: { id: media.id },
    data: { uploadedAt: new Date() },
  });
  failDelete = true;
  await expect(
    processVideoMedia(media.id, new AbortController().signal),
  ).rejects.toThrow();
  const encoded = await prisma.mediaUpload.findUniqueOrThrow({
    where: { id: media.id },
  });
  expect(encoded.ready).toBe(true);
  expect(objects.has(`/media/${media.objectKey}`)).toBe(true);
  failDelete = false;
  await processVideoMedia(media.id, new AbortController().signal);
  expect(
    (await prisma.mediaUpload.findUniqueOrThrow({ where: { id: media.id } }))
      .objectKey,
  ).toBe(encoded.objectKey);
  expect(objects.has(`/media/${media.objectKey}`)).toBe(false);
}, 30_000);

test("multipart finalization rejects a wrong size and closed uploads cannot obtain new chunk URLs", async () => {
  const media = await ticket(bytes);
  await expect(
    completeMediaUpload({ ...media, sizeBytes: media.sizeBytes + BigInt(1) }),
  ).rejects.toThrow("chunks are missing");
  expect(objects.has(`/media/${media.objectKey}`)).toBe(false);
  await expect(
    signMediaPart({ ...media, uploadedAt: new Date() }, 1),
  ).rejects.toThrow("closed");
  await expect(
    signMediaPart({ ...media, createdAt: new Date(0) }, 1),
  ).rejects.toThrow("closed");
});
