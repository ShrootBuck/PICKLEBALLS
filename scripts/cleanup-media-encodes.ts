import { readFileSync } from "node:fs";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { parse } from "dotenv";

// Clean only the new encoder's versioned directories, never staging or legacy
// objects. Seven days exceeds both the 24-hour task limit and playback URL TTLs.
const production = process.argv.includes("--production");
const environment = parse(
  readFileSync(production ? ".env.production.local" : ".env"),
);
for (const name of [
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
])
  process.env[name] = environment[name] ?? "";
if (
  !production &&
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL ?? "").hostname,
  )
)
  throw new Error("Local cleanup requires the local database.");
const { getPrisma } = await import("@/lib/prisma");
const { r2 } = await import("@/lib/r2");
const prisma = getPrisma();
const { client, bucket } = r2();
const cutoff = Date.now() - 7 * 24 * 3600_000;
let cursor: string | undefined;
let candidates = 0;
try {
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "media/v_",
        ContinuationToken: cursor,
        MaxKeys: 500,
      }),
    );
    const objects = (page.Contents ?? []).flatMap((object) => {
      const match = object.Key?.match(
        /^(media\/(v_[a-f0-9-]{36})\/[a-f0-9-]{36}\/)(?:video\.mp4|poster\.webp|hls\/(?:master|v\d+|v\d+_\d+)\.(?:m3u8|ts))$/,
      );
      return match &&
        object.LastModified &&
        object.LastModified.getTime() < cutoff
        ? [{ key: object.Key as string, prefix: match[1], id: match[2] }]
        : [];
    });
    const references = await prisma.mediaUpload.findMany({
      where: { id: { in: [...new Set(objects.map((object) => object.id))] } },
      select: { objectKey: true, posterKey: true },
    });
    const keep = references
      .flatMap((media) => [media.objectKey, media.posterKey])
      .filter((key): key is string => !!key);
    // HLS streaming was removed, so its segments and playlists are never read.
    const unused = objects.filter(
      (object) =>
        object.key.startsWith(`${object.prefix}hls/`) ||
        !keep.some((key) => key.startsWith(object.prefix)),
    );
    candidates += unused.length;
    if (unused.length && process.argv.includes("--apply")) {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: unused.map(({ key }) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );
      if (result.Errors?.length)
        throw new Error(
          `Could not delete ${result.Errors.length} unused assets.`,
        );
    }
    cursor = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (cursor);
  console.log(
    `${production ? "Production" : "Local"}: ${candidates} unreferenced assets older than seven days ${process.argv.includes("--apply") ? "deleted" : "found (dry run; add --apply to delete)"}.`,
  );
} finally {
  await prisma.$disconnect();
}
