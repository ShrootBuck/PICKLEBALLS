import { defineConfig } from "prisma/config";

// Explicit container-only entrypoint. Do not load local or backup dotenv files.
// Keep prisma.config.ts's loopback restriction for ordinary development.
const args = process.argv;
if (!args.includes("migrate") || !args.includes("deploy")) {
  throw new Error("This config is only for prisma migrate deploy.");
}
if (process.env.PB_SELF_HOSTED !== "true") {
  throw new Error("Self-hosted migrations require PB_SELF_HOSTED=true.");
}
const url = process.env.DIRECT_DATABASE_URL;
if (!url || !["postgresql:", "postgres:"].includes(new URL(url).protocol)) {
  throw new Error(
    "Set DIRECT_DATABASE_URL to the self-hosted Postgres connection.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
