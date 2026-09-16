import { readFileSync } from "node:fs";
import { idempotencyKeys, tasks } from "@trigger.dev/sdk";
import { parse } from "dotenv";
import type { processMedia } from "@/src/trigger/media";

// Explicit file selection prevents Bun's automatic production-backup loading
// from turning a local maintenance command into a production operation.
const deployment = process.argv.includes("--deployment");
if (deployment && process.env.VERCEL_ENV !== "production") {
  console.log(
    "Skipping production video upgrades outside a production deploy.",
  );
  process.exit(0);
}
if (deployment && !process.env.VERCEL_GIT_COMMIT_SHA) {
  throw new Error("Deployment backfill requires the deployed Git commit.");
}
const production = deployment || process.argv.includes("--production");
const environment = deployment
  ? process.env
  : parse(readFileSync(production ? ".env.production.local" : ".env"));
for (const name of ["DATABASE_URL", "TRIGGER_SECRET_KEY"])
  process.env[name] = environment[name] ?? "";
if (
  !production &&
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL ?? "").hostname,
  )
)
  throw new Error("Local backfill requires the local database.");
const { getPrisma } = await import("@/lib/prisma");
const prisma = getPrisma();
try {
  const limitArgument = process.argv.find((argument) =>
    argument.startsWith("--limit="),
  );
  const limit = Number(limitArgument?.split("=")[1] ?? 25);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Use a limit from 1 to 100.");
  const where = {
    ready: true,
    hlsKey: null,
    mimeType: { startsWith: "video/" },
  };
  const remaining = await prisma.mediaUpload.count({ where });
  const videos = await prisma.mediaUpload.findMany({
    where,
    select: { id: true, objectKey: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  console.log(
    `${production ? "Production" : "Local"}: ${remaining} videos need adaptive playback. Selected ${videos.length}.`,
  );
  if (!process.argv.includes("--apply")) {
    console.log(
      "Dry run. Add --apply to queue this batch. Existing playback remains available throughout.",
    );
  } else {
    if (!process.env.TRIGGER_SECRET_KEY)
      throw new Error("Trigger.dev key is missing.");
    for (const video of videos) {
      await tasks.trigger<typeof processMedia>(
        "process-media",
        { id: video.id },
        {
          idempotencyKey: await idempotencyKeys.create(
            `adaptive-v1:${video.id}:${video.objectKey}`,
            { scope: "global" },
          ),
          idempotencyKeyTTL: "24h",
          priority: -86400,
          // A build can finish before Trigger's Git deployment. Wait for the
          // matching encoder instead of silently dispatching to the old worker.
          ...(deployment
            ? { externalDeploymentId: process.env.VERCEL_GIT_COMMIT_SHA }
            : {}),
        },
      );
    }
    console.log(
      `Queued ${videos.length} upgrades at lower priority than new uploads.`,
    );
  }
} finally {
  await prisma.$disconnect();
}
