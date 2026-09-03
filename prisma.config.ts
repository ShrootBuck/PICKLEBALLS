import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL;
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
  },
});
