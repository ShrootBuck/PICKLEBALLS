/** Disposable Postgres regression suite. --serve also starts an isolated UI fixture. */
import { createHmac, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const root = process.cwd();
const name = `pb-social-${randomUUID().slice(0, 8)}`;
const cache = join(root, "node_modules/.cache");
await mkdir(cache, { recursive: true });
const temporary = await mkdtemp(join(cache, "social-"));
let app: ReturnType<typeof Bun.spawn> | undefined;
let fixture: ReturnType<typeof Bun.serve> | undefined;
let containerStarted = false;
let wroteFixtureEnv = false;
async function run(command: string[], env = process.env) {
  const child = Bun.spawn(command, {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code)
    throw new Error(
      `${command.slice(0, 3).join(" ")} failed:\n${stdout}\n${stderr}`,
    );
  return (command[1] === "test" ? `${stdout}\n${stderr}` : stdout).trim();
}
try {
  await run([
    "docker",
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "-e",
    "POSTGRES_PASSWORD=disposable",
    "-e",
    "POSTGRES_DB=pickleballs_test",
    "-p",
    "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);
  containerStarted = true;
  const mapped = await run(["docker", "port", name, "5432/tcp"]);
  const port = mapped.split(":").at(-1);
  const databaseUrl = `postgresql://postgres:disposable@127.0.0.1:${port}/pickleballs_test`;
  for (let attempt = 0; ; attempt++) {
    try {
      // The image briefly starts a socket-only bootstrap server. Wait for TCP
      // so Prisma cannot race that server's shutdown.
      await run([
        "docker",
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
      ]);
      break;
    } catch (error) {
      if (attempt > 60) throw error;
      await Bun.sleep(250);
    }
  }
  const env = {
    ...process.env,
    NODE_ENV: "development" as const,
    PB_TEST_DATABASE: "disposable-docker",
    WATCHPACK_POLLING: "true",
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: databaseUrl,
    SHADOW_DATABASE_URL: "",
    BETTER_AUTH_SECRET: "disposable-pickleballs-social-testing-secret",
    BETTER_AUTH_URL: "http://localhost:3317",
    NEXT_PUBLIC_APP_URL: "http://localhost:3317",
    DISCORD_CLIENT_ID: "test",
    DISCORD_CLIENT_SECRET: "test",
    OPENROUTER_API_KEY: "",
    TRIGGER_SECRET_KEY: "",
    BOOTSTRAP_DISCORD_USER_ID: "",
    VAPID_PRIVATE_KEY: "",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
    R2_ACCOUNT_ID: "disposable",
    R2_ACCESS_KEY_ID: "disposable",
    R2_SECRET_ACCESS_KEY: "disposable",
    R2_BUCKET: "media",
    PB_TEST_R2_ENDPOINT: "http://127.0.0.1:3318",
    TMPDIR: "/private/tmp",
  };
  const migrations = (await readdir(join(root, "prisma/migrations")))
    .filter((item) => /^\d/.test(item))
    .sort();
  const socialMigration = "20260908213202_social_feed";
  const oldPath = join(temporary, "migrations");
  await mkdir(oldPath);
  await cp(
    join(root, "prisma/migrations/migration_lock.toml"),
    join(oldPath, "migration_lock.toml"),
  );
  for (const migration of migrations.filter((item) => item < socialMigration))
    await cp(
      join(root, "prisma/migrations", migration),
      join(oldPath, migration),
      { recursive: true },
    );
  const config = join(temporary, "prisma.config.ts");
  await writeFile(
    config,
    `import { defineConfig } from "prisma/config"; export default defineConfig({schema: ${JSON.stringify(join(root, "prisma/schema.prisma"))}, migrations: {path: ${JSON.stringify(oldPath)}}, datasource: {url: process.env.DATABASE_URL!}});`,
  );
  await run(
    ["bunx", "--bun", "prisma", "migrate", "deploy", "--config", config],
    env,
  );
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  await pg.query(`INSERT INTO "User" (id,email,name,"updatedAt") VALUES ('legacy-user','legacy@example.invalid','Legacy Member',now());
    INSERT INTO "Circle" (id,slug,name,"updatedAt") VALUES ('legacy-circle','legacy-circle','Legacy circle',now());
    INSERT INTO "Membership" ("userId","circleId") VALUES ('legacy-user','legacy-circle');
    INSERT INTO "CheckIn" (id,"userId","circleId",day,signal,"updatedAt") VALUES ('old-day','legacy-user','legacy-circle','2026-08-01','YAY','2026-08-01T18:12:34.123Z'), ('existing-day','legacy-user','legacy-circle','2026-08-02','NAY','2026-08-02T20:00:00Z');
    INSERT INTO "CheckInUpdate" (id,"checkInId","userId","circleId",day,signal,"createdAt") VALUES ('existing-update','existing-day','legacy-user','legacy-circle','2026-08-02','NAY','2026-08-02T19:00:00Z');
    INSERT INTO "SocialReply" (id,"authorId","circleId","checkInId",body,"updatedAt") VALUES ('old-reply','legacy-user','legacy-circle','old-day','Historical discussion',now());`);
  await pg.end();
  await run(["bunx", "--bun", "prisma", "migrate", "deploy"], env);
  console.log(
    "Migrated a populated disposable database, including legacy check-ins.",
  );
  console.log(await run(["bun", "test", "./tests/social.integration.ts"], env));
  console.log(await run(["bun", "test", "./tests/media.integration.ts"], env));
  if (process.argv.includes("--serve")) {
    console.log(await run(["bun", "scripts/social-fixtures.ts"], env));
    if (process.argv.includes("--video"))
      console.log(await run(["bun", "scripts/media-fixtures.ts"], env));
    const objects = new Map<string, { data: Uint8Array; type: string }>();
    fixture = Bun.serve({
      hostname: "127.0.0.1",
      port: 3318,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/login") {
          const requested = url.searchParams.get("user") ?? "you";
          const userId = `demo-${["you", "eddie", "sam", "jules"].includes(requested) ? requested : "you"}`;
          const token = `fixture-session-${userId}`;
          const loginDb = new Client({ connectionString: databaseUrl });
          await loginDb.connect();
          try {
            // A fixture can be used again after exercising real sign-out.
            await loginDb.query(
              `INSERT INTO "Session" (id, token, "userId", "expiresAt", "updatedAt")
               VALUES ($1, $2, $3, now() + interval '1 day', now())
               ON CONFLICT (token) DO UPDATE SET "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = now()`,
              [`session-${userId}`, token, userId],
            );
          } finally {
            await loginDb.end();
          }
          const signature = createHmac("sha256", env.BETTER_AUTH_SECRET)
            .update(token)
            .digest("base64");
          const headers = new Headers({ location: "http://localhost:3317/" });
          headers.append(
            "set-cookie",
            `pickle-balls.session_token=${encodeURIComponent(`${token}.${signature}`)}; Path=/; HttpOnly; SameSite=Lax`,
          );
          headers.append(
            "set-cookie",
            "pb_active_circle=demo-circle; Path=/; HttpOnly; SameSite=Lax",
          );
          return new Response(null, { status: 302, headers });
        }
        const headers = {
          "access-control-allow-origin": "http://localhost:3317",
          "access-control-allow-methods": "GET, PUT, HEAD, OPTIONS",
          "access-control-allow-headers": "*",
          "access-control-expose-headers": "ETag",
          ETag: '"fixture"',
        };
        if (request.method === "OPTIONS")
          return new Response(null, { headers });
        if (request.method === "PUT") {
          objects.set(url.pathname, {
            data: new Uint8Array(await request.arrayBuffer()),
            type: request.headers.get("content-type") || "image/jpeg",
          });
          return new Response(null, { headers });
        }
        const object = url.pathname.startsWith("/media/fixture-video-")
          ? {
              data: new Uint8Array(
                await Bun.file(
                  url.pathname.endsWith("poster")
                    ? "/private/tmp/pb-video-fixture.webp"
                    : "/private/tmp/pb-video-fixture.mp4",
                ).arrayBuffer(),
              ),
              type: url.pathname.endsWith("poster")
                ? "image/webp"
                : "video/mp4",
            }
          : url.pathname.startsWith("/media/fixture-screen-")
            ? {
                data: new Uint8Array(
                  await Bun.file(
                    "/private/tmp/pb-proof-fixture.png",
                  ).arrayBuffer(),
                ),
                type: "image/png",
              }
            : objects.get(url.pathname);
        if (!object)
          return new Response("Missing fixture media", {
            status: 404,
            headers,
          });
        const range = request.headers
          .get("range")
          ?.match(/^bytes=(\d+)-(\d*)$/);
        if (range) {
          const start = Number(range[1]);
          const end = range[2]
            ? Math.min(Number(range[2]), object.data.length - 1)
            : object.data.length - 1;
          return new Response(object.data.slice(start, end + 1), {
            status: 206,
            headers: {
              ...headers,
              "content-type": object.type,
              "accept-ranges": "bytes",
              "content-range": `bytes ${start}-${end}/${object.data.length}`,
              "content-length": String(end - start + 1),
            },
          });
        }
        return new Response(
          request.method === "HEAD" ? null : new Uint8Array(object.data),
          {
            headers: {
              ...headers,
              "content-type": object.type,
              "content-length": String(object.data.length),
            },
          },
        );
      },
    });
    app = Bun.spawn(
      [
        "bun",
        "run",
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3317",
      ],
      { env, cwd: root, stdout: "inherit", stderr: "inherit" },
    );
    await writeFile(
      "/private/tmp/pb-social-test-env.json",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(env).filter(
            ([key, value]) => process.env[key] !== value,
          ),
        ),
      ),
    );
    wroteFixtureEnv = true;
    console.log(
      "UI fixture: http://localhost:3318/login (local test accounts only). Stop this runner to remove the disposable database.",
    );
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
      app?.exited.then(() => resolve());
    });
  }
} finally {
  app?.kill();
  fixture?.stop(true);
  if (containerStarted) await run(["docker", "rm", "-f", name]);
  await rm(temporary, { recursive: true, force: true });
  if (wroteFixtureEnv)
    await rm("/private/tmp/pb-social-test-env.json", { force: true });
}
