import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  pickleBallsPrisma?: PrismaClient;
};

function createPrismaClient() {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL is not configured");
    }
    // Local dev convenience only. Production crashes loudly above instead
    // of silently connecting somewhere unexpected.
    connectionString =
      "postgresql://pickle_balls:pickle_balls@localhost:5432/pickle_balls";
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export function getPrisma() {
  if (globalForPrisma.pickleBallsPrisma)
    return globalForPrisma.pickleBallsPrisma;
  const client = createPrismaClient();
  globalForPrisma.pickleBallsPrisma = client;
  return client;
}
