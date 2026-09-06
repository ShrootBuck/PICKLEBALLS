import { createHash } from "node:crypto";

export function mediaDigest(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Read back the actual object, not its ETag: multipart ETags aren't SHA-256 hashes.
export async function verifyMediaCopy(
  expected: Uint8Array,
  key: string,
  download: (key: string) => Promise<Uint8Array>,
) {
  const actual = await download(key);
  if (
    actual.length !== expected.length ||
    mediaDigest(actual) !== mediaDigest(expected)
  ) {
    throw new Error(
      `R2 verification failed for ${key}; database bytes retained.`,
    );
  }
}
