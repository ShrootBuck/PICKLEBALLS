import "dotenv/config";

import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adminEmail = "zayd@zaydkrunz.com";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });
  if (existingAdmin) {
    throw new Error(
      `${adminEmail} already exists. Sign in and use /admin instead.`,
    );
  }

  const circle = await prisma.circle.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!circle) {
    throw new Error("Seed the Pickle Balls circle before bootstrapping admin.");
  }

  const now = new Date();
  await prisma.invite.updateMany({
    where: {
      email: adminEmail,
      createdById: null,
      usedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: now },
  });

  const token = randomBytes(32).toString("base64url");
  await prisma.invite.create({
    data: {
      tokenHash: createHash("sha256").update(token).digest("hex"),
      label: "Zayd admin bootstrap",
      email: adminEmail,
      role: "OWNER",
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      circleId: circle.id,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log(new URL(`/join/${token}`, appUrl).toString());
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
