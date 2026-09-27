import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Keep the historical r2() API while allowing an S3-compatible deployment.
// Public signing and server traffic use different endpoints on the home server.
let storage:
  | {
      config: string;
      bucket: string;
      client: S3Client;
      publicClient: S3Client;
    }
  | undefined;

export function r2() {
  const env = process.env;
  const generic = Boolean(env.S3_ENDPOINT);
  const bucket = generic ? env.S3_BUCKET : env.R2_BUCKET;
  const accessKeyId = generic ? env.S3_ACCESS_KEY_ID : env.R2_ACCESS_KEY_ID;
  const secretAccessKey = generic
    ? env.S3_SECRET_ACCESS_KEY
    : env.R2_SECRET_ACCESS_KEY;
  if (
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    (!generic && !env.R2_ACCOUNT_ID)
  )
    throw new Error(
      "Media storage is not configured. Set S3 or R2 environment variables.",
    );
  const testEndpoint = env.PB_TEST_R2_ENDPOINT;
  if (
    testEndpoint &&
    (env.PB_TEST_DATABASE !== "disposable-docker" ||
      new URL(testEndpoint).hostname !== "127.0.0.1")
  )
    throw new Error("R2 test endpoint requires the isolated test runner.");
  const endpoint =
    testEndpoint ||
    env.S3_ENDPOINT ||
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const publicEndpoint =
    testEndpoint || (generic ? env.S3_PUBLIC_ENDPOINT || endpoint : endpoint);
  const region = generic ? env.S3_REGION || "garage" : "auto";
  const config = JSON.stringify([
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
    publicEndpoint,
    region,
  ]);
  if (storage?.config === config)
    return {
      bucket: storage.bucket,
      client: storage.client,
      publicClient: storage.publicClient,
    };
  storage?.client.destroy();
  if (storage?.publicClient !== storage?.client)
    storage?.publicClient.destroy();
  const makeClient = (url: string) =>
    new S3Client({
      region,
      endpoint: url,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
    });
  const client = makeClient(endpoint);
  storage = {
    config,
    bucket,
    client,
    publicClient:
      publicEndpoint === endpoint ? client : makeClient(publicEndpoint),
  };
  return {
    bucket: storage.bucket,
    client: storage.client,
    publicClient: storage.publicClient,
  };
}
export async function putMedia(
  key: string,
  data: Uint8Array,
  mimeType: string,
  signal?: AbortSignal,
) {
  const { client, bucket } = r2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: mimeType,
    }),
    { abortSignal: signal },
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
  internal = false,
) {
  const { client, publicClient, bucket } = r2();
  return getSignedUrl(
    internal ? client : publicClient,
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
