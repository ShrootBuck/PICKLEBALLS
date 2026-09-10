import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    process.env;
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  )
    throw new Error(
      "Media storage is not configured. Set the R2 environment variables.",
    );
  const testEndpoint = process.env.PB_TEST_R2_ENDPOINT;
  if (
    testEndpoint &&
    (process.env.PB_TEST_DATABASE !== "disposable-docker" ||
      new URL(testEndpoint).hostname !== "127.0.0.1")
  )
    throw new Error("R2 test endpoint requires the isolated test runner.");
  return {
    bucket: R2_BUCKET,
    client: new S3Client({
      region: "auto",
      endpoint:
        testEndpoint || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };
}
export async function putMedia(
  key: string,
  data: Uint8Array,
  mimeType: string,
) {
  const { client, bucket } = r2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: mimeType,
    }),
  );
}
export async function getMediaBytes(key: string) {
  const { client, bucket } = r2();
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!result.Body) throw new Error("Media object is missing.");
  return result.Body.transformToByteArray();
}
export async function mediaDownloadUrl(
  key: string,
  mimeType: string,
  expiresIn = 24 * 3600,
) {
  const { client, bucket } = r2();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: mimeType,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn },
  );
}

// Call only after checking access. Finalized uploads have immutable object keys.
export async function immutableImageResponse(key: string, mimeType: string) {
  const { client, bucket } = r2();
  const object = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!object.Body) throw new Error("Media object is missing.");
  const headers = new Headers({
    "content-type": mimeType,
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  if (object.ContentLength !== undefined)
    headers.set("content-length", String(object.ContentLength));
  if (object.ETag) headers.set("etag", object.ETag);
  return new Response(object.Body.transformToWebStream(), { headers });
}
