import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  pickleBallsPrisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://pickle_balls:pickle_balls@localhost:5432/pickle_balls";

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export function getPrisma() {
  const client = globalForPrisma.pickleBallsPrisma ?? createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pickleBallsPrisma = client;
  }

  return client;
}
