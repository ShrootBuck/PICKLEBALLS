import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "prisma/config";

// The checked local .env owns local CLI targets. Bun may otherwise inject
// .env.production.local before this module starts. The browser runner passes
// its disposable loopback target explicitly and is validated below as well.
const localEnvironment =
  !process.env.VERCEL &&
  process.env.PB_TEST_DATABASE !== "disposable-docker" &&
  existsSync(".env")
    ? parse(readFileSync(".env"))
    : null;
const cliEnvironment = localEnvironment ?? process.env;
const directDatabaseUrl = cliEnvironment.DIRECT_DATABASE_URL;
if (process.env.VERCEL && !directDatabaseUrl) {
  // `prisma migrate deploy` takes a Postgres advisory lock, which the pooled
  // connection cannot grant (P1002 timeout). Fail loudly so a deploy never
  // silently migrates over the pooler.
  throw new Error(
    "DIRECT_DATABASE_URL is not configured. Set it to the direct (non-pooled) Postgres URL so `prisma migrate deploy` can take its advisory lock.",
  );
}
// Migrations must run on a direct connection. The pooled DATABASE_URL stays
// for serverless runtime traffic (see lib/prisma.ts).
const databaseUrl = directDatabaseUrl ?? cliEnvironment.DATABASE_URL;
const shadowDatabaseUrl = cliEnvironment.SHADOW_DATABASE_URL;
// A production backup can be auto-loaded by a command runner. Local CLI
// commands must never silently choose it as their migration/reset target.
if (!process.env.VERCEL) {
  for (const [label, value] of [
    ["DATABASE_URL", databaseUrl],
    ["SHADOW_DATABASE_URL", shadowDatabaseUrl],
  ]) {
    if (!value) continue;
    let host: string;
    try {
      host = new URL(value).hostname;
    } catch {
      throw new Error(`${label} is not a valid database URL.`);
    }
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
      throw new Error(
        `Local Prisma commands require a loopback ${label}. Check environment overrides and .env.production.local; deploy production migrations through Vercel.`,
      );
    }
  }
}
if (!databaseUrl) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not configured");
  }
  // Local dev convenience only. Production crashes loudly above instead
  // of silently connecting somewhere unexpected.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      databaseUrl ??
      "postgresql://pickle_balls:pickle_balls@localhost:5432/pickle_balls",
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
