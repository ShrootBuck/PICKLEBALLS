import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { parse } from "dotenv";
import { PrismaClient } from "../generated/prisma/client";
import { mediaDigest, verifyMediaCopy } from "../lib/media-migration";
import { getMediaBytes, putMedia } from "../lib/r2";

// Require an explicit file so Bun's automatic .env.production.local loading can
// never silently choose either the source database or destination bucket.
const args = process.argv.slice(2);
const fileIndex = args.indexOf("--env-file");
if (fileIndex < 0 || !args[fileIndex + 1])
  throw new Error(
    "Usage: bun scripts/migrate-media-to-r2.ts --env-file <path> [--apply] [--prune]",
  );
const envFile = resolve(args[fileIndex + 1]);
const env = parse(readFileSync(envFile));
const url = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
if (!url)
  throw new Error(
    "Selected file must contain DATABASE_URL or DIRECT_DATABASE_URL.",
  );
if (
  envFile === resolve(".env") &&
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error(".env must point to local Postgres.");
for (const key of [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
]) {
  process.env[key] = env[key] ?? "";
}
const apply = args.includes("--apply");
const prune = args.includes("--prune");
if (prune && !apply)
  throw new Error(
    "--prune requires --apply and re-verifies every copy before removing database bytes.",
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
let cursor: string | undefined;
let checked = 0;
try {
  console.log({
    mode: apply ? (prune ? "verify-and-prune" : "copy-and-verify") : "dry-run",
    databaseHost: new URL(url).hostname,
    bucket: env.R2_BUCKET || "not configured",
  });
  while (true) {
    const rows = await db.taskProofImage.findMany({
      where: {
        data: { not: null },
        ...(cursor ? { proofId: { gt: cursor } } : {}),
      },
      orderBy: { proofId: "asc" },
      take: 20,
    });
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.proofId;
      if (!row.data) continue;
      checked++;
      if (!apply) continue;
      const key =
        row.objectKey ??
        `legacy-proofs/${row.proofId}/${mediaDigest(row.data)}`;
      if (!row.objectKey) await putMedia(key, row.data, row.mimeType);
      await verifyMediaCopy(row.data, key, getMediaBytes);
      // CAS prevents a concurrent migration or deletion from changing what we verified.
      const result = await db.taskProofImage.updateMany({
        where: {
          proofId: row.proofId,
          objectKey: row.objectKey,
          data: { equals: row.data },
        },
        data: { objectKey: key, ...(prune ? { data: null } : {}) },
      });
      if (result.count !== 1)
        throw new Error(
          `Photo ${row.proofId} changed concurrently; rerun migration.`,
        );
    }
    console.log({ checked });
  }
  console.log({
    checked,
    remainingDatabasePhotos: await db.taskProofImage.count({
      where: { data: { not: null } },
    }),
    complete: true,
  });
} finally {
  await db.$disconnect();
}
