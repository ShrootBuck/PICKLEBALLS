import { afterEach, beforeEach, expect, test } from "bun:test";
import { mediaDownloadUrl, r2 } from "../lib/r2";

const names = [
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_REGION",
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "PB_TEST_R2_ENDPOINT",
  "PB_TEST_DATABASE",
];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
});
afterEach(() => {
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

test("Garage signs browser URLs publicly and worker URLs on the private network", async () => {
  Object.assign(process.env, {
    S3_ENDPOINT: "http://garage:3900",
    S3_PUBLIC_ENDPOINT: "https://media.example.com",
    S3_BUCKET: "media",
    S3_ACCESS_KEY_ID: "test-key",
    S3_SECRET_ACCESS_KEY: "test-secret",
  });
  const publicUrl = new URL(
    await mediaDownloadUrl("proof/a b.mp4", "video/mp4"),
  );
  const privateUrl = new URL(
    await mediaDownloadUrl("proof/a b.mp4", "video/mp4", 300, true),
  );
  expect(publicUrl.origin).toBe("https://media.example.com");
  expect(privateUrl.origin).toBe("http://garage:3900");
  expect(publicUrl.pathname).toBe("/media/proof/a%20b.mp4");
  expect(publicUrl.searchParams.get("X-Amz-Credential")).toContain(
    "/garage/s3/aws4_request",
  );
  expect(privateUrl.searchParams.get("X-Amz-Expires")).toBe("300");
  expect(publicUrl.searchParams.get("X-Amz-Signature")).not.toBe(
    privateUrl.searchParams.get("X-Amz-Signature"),
  );
});

test("existing R2 deployments retain their endpoint and signing region", async () => {
  Object.assign(process.env, {
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET: "media",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
  });
  const url = new URL(await mediaDownloadUrl("image.png", "image/png"));
  expect(url.origin).toBe("https://test-account.r2.cloudflarestorage.com");
  expect(url.searchParams.get("X-Amz-Credential")).toContain(
    "/auto/s3/aws4_request",
  );
  expect(r2().client).toBe(r2().publicClient);
});

test("partial S3 configuration never silently uses cloud storage credentials", () => {
  Object.assign(process.env, {
    S3_ENDPOINT: "http://garage:3900",
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET: "media",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
  });
  expect(() => r2()).toThrow("Media storage is not configured");
});
