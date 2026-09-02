import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FullConfig } from "@playwright/test";

const stateDirectory = resolve("tests/browser/.auth");

function signedSessionCookie(token: string, secret: string) {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

export default async function globalSetup(_config: FullConfig) {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !/test/i.test(new URL(databaseUrl).pathname)) {
    throw new Error("Refusing to reset a database without 'test' in its name.");
  }
  const secret =
    process.env.TEST_BETTER_AUTH_SECRET ??
    "pickle-balls-browser-test-secret-that-is-at-least-32-characters";
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_SECRET = secret;

  const pushed = spawnSync(
    "bun",
    ["x", "prisma", "db", "push", "--force-reset"],
    { env: process.env, stdio: "inherit" },
  );
  if (pushed.status !== 0)
    throw new Error("Could not prepare the browser test DB.");

  const { getPrisma } = await import("@/lib/prisma");
  const prisma = getPrisma();
  const circle = await prisma.circle.create({
    data: { slug: "pickle-balls", name: "Pickle Balls" },
  });
  await mkdir(stateDirectory, { recursive: true });

  const people = [
    { key: "owner", name: "Zayd", username: "zayd", role: "OWNER" as const },
    { key: "mia", name: "Mia", username: "mia", role: "MEMBER" as const },
    { key: "leo", name: "Leo", username: "leo", role: "MEMBER" as const },
    { key: "ava", name: "Ava", username: "ava", role: "MEMBER" as const },
  ];

  for (const person of people) {
    const userId = randomUUID();
    const token = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${person.key}@discord.placeholder.invalid`,
        emailVerified: true,
        name: person.name,
        initials: person.name.slice(0, 2).toUpperCase(),
        discordId: `browser-${person.key}-discord-id`,
        discordUsername: person.username,
        ...(person.role === "OWNER"
          ? {}
          : {
              memberships: {
                create: { circleId: circle.id, role: person.role },
              },
            }),
        accounts: {
          create: {
            id: randomUUID(),
            issuer: "https://discord.com",
            accountId: `browser-${person.key}-discord-id`,
            providerId: "discord",
          },
        },
        sessions: {
          create: {
            id: randomUUID(),
            token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      },
    });
    await writeFile(
      resolve(stateDirectory, `${person.key}.json`),
      JSON.stringify({
        cookies: [
          {
            name: "pickle-balls.session_token",
            value: signedSessionCookie(token, secret),
            domain: "127.0.0.1",
            path: "/",
            expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      }),
    );
  }
  await prisma.$disconnect();
}
