import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// Run only as an explicit migration job. Neither source deletions nor DB writes.
const env = process.env;
if (
  env.PB_MEDIA_MIGRATION !== "copy-to-local" ||
  !env.S3_ENDPOINT ||
  !env.R2_ACCOUNT_ID ||
  !env.S3_BUCKET ||
  !env.R2_BUCKET
)
  throw new Error("Explicit source and local destination required");
const source = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || "",
  },
});
const target = new S3Client({
  region: env.S3_REGION || "garage",
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: env.S3_SECRET_ACCESS_KEY || "",
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
let count = 0;
let bytes = 0;
let token: string | undefined;
try {
  do {
    const page = await source.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents || []) {
      if (!object.Key) continue;
      const input = await source.send(
        new GetObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: object.Key,
          IfMatch: object.ETag,
        }),
      );
      if (!input.Body) throw new Error("Missing source object body");
      const hash = createHash("sha256");
      const stream = new Transform({
        transform(chunk, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      // The SDK Node response is a readable stream. Forward stream failures.
      const body = input.Body as import("node:stream").Readable;
      body.on("error", (error) => stream.destroy(error));
      body.pipe(stream);
      await new Upload({
        client: target,
        queueSize: 2,
        partSize: 8 * 1024 * 1024,
        params: {
          Bucket: env.S3_BUCKET,
          Key: object.Key,
          Body: stream,
          ContentType: input.ContentType,
          ContentLength: input.ContentLength,
          CacheControl: input.CacheControl,
          ContentDisposition: input.ContentDisposition,
          ContentEncoding: input.ContentEncoding,
          Metadata: input.Metadata,
        },
      }).done();
      const expected = hash.digest("hex");
      const copied = await target.send(
        new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: object.Key }),
      );
      const actual = createHash("sha256");
      if (!copied.Body) throw new Error("Missing destination object body");
      for await (const chunk of copied.Body as import("node:stream").Readable)
        actual.update(chunk);
      if (
        actual.digest("hex") !== expected ||
        copied.ContentLength !== input.ContentLength ||
        copied.ContentType !== input.ContentType
      )
        throw new Error("Media verification failed");
      // Detect changes to the supposedly frozen source during copying.
      const current = await source.send(
        new HeadObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: object.Key,
          IfMatch: object.ETag,
        }),
      );
      if (current.ContentLength !== input.ContentLength)
        throw new Error("Source changed during migration");
      count++;
      bytes += input.ContentLength || 0;
      if (count % 25 === 0)
        console.log(
          JSON.stringify({ verifiedObjects: count, verifiedBytes: bytes }),
        );
    }
    token = page.NextContinuationToken;
  } while (token);
  console.log(
    JSON.stringify({
      status: "PASS",
      verifiedObjects: count,
      verifiedBytes: bytes,
      verification: "SHA256 and size for every object",
    }),
  );
} finally {
  source.destroy();
  target.destroy();
}
