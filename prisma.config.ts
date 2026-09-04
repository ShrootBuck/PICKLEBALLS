import "dotenv/config";
import { defineConfig } from "prisma/config";

const directDatabaseUrl = process.env.DIRECT_DATABASE_URL;
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
const databaseUrl = directDatabaseUrl ?? process.env.DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;
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
