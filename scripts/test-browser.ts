import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { seedBrowserData, testSecret } from "../tests/browser/seed";

function command(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { encoding: "utf8", env: process.env });
  if (result.status !== 0)
    throw new Error(`${cmd} ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test port available.");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

// Never accepts an existing database URL. Each invocation owns exactly one
// fresh Docker container; cleanup can only remove that container.
const container = `pickleballs-browser-${randomUUID().slice(0, 8)}`;
let created = false;
let server: ReturnType<typeof spawn> | undefined;
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  server?.kill("SIGTERM");
  if (created)
    spawnSync("docker", ["rm", "-f", "-v", container], { stdio: "ignore" });
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

try {
  command("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_PASSWORD=browser-fixtures-only",
    "-e",
    "POSTGRES_DB=pickleballs_audit_test",
    "postgres:17-alpine",
  ]);
  created = true;
  const dbPort = command("docker", ["port", container, "5432"])
    .split(":")
    .at(-1);
  const appPort = await freePort();
  const baseURL = `http://localhost:${appPort}`;
  Object.assign(process.env, {
    DATABASE_URL: `postgres://postgres:browser-fixtures-only@127.0.0.1:${dbPort}/pickleballs_audit_test?sslmode=disable`,
    DIRECT_DATABASE_URL: "",
    SHADOW_DATABASE_URL: "",
    TEST_DATABASE_URL: "",
    PB_TEST_DATABASE: "disposable-docker",
    PB_TEST_BASE_URL: baseURL,
    BETTER_AUTH_URL: baseURL,
    NEXT_PUBLIC_APP_URL: baseURL,
    BETTER_AUTH_SECRET: testSecret,
    DISCORD_CLIENT_ID: "test-client",
    DISCORD_CLIENT_SECRET: "test-secret",
    BOOTSTRAP_DISCORD_USER_ID: "",
    OPENROUTER_API_KEY: "",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    CRON_SECRET: "browser-test-cron",
    NODE_ENV: process.argv.includes("--build") ? "production" : "development",
    VERCEL: "",
    PB_TEST_BUILD: "1",
  });
  // Override all migration targets, even if Bun loads a local env backup.
  process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
  for (let i = 0; ; i++) {
    const ready =
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
        stdio: "ignore",
      }).status === 0;
    if (ready) break;
    if (i === 30) throw new Error("Temporary Postgres did not start.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log("Applying migrations to the new temporary container.");
  command("bunx", ["--bun", "prisma", "migrate", "deploy"]);
  await seedBrowserData();
  if (process.argv.includes("--build")) {
    console.log(command("bunx", ["next", "build"]));
  } else {
    server = spawn("bunx", ["next", "dev", "--port", String(appPort)], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let serverLog = "";
    for (const stream of [server.stdout, server.stderr])
      stream?.on("data", (chunk) => {
        serverLog = (serverLog + chunk).slice(-30_000);
      });
    for (let i = 0; ; i++) {
      if (server.exitCode !== null) throw new Error(serverLog);
      try {
        const response = await fetch(`${baseURL}/api/auth/ok`);
        if (response.ok) break;
      } catch {
        /* server is starting */
      }
      if (i === 90) throw new Error(`Test server did not start.\n${serverLog}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (process.argv.includes("--serve")) {
      console.log(`Audit fixture app: ${baseURL}\nContainer: ${container}`);
      await new Promise<void>((resolve) => server?.on("exit", () => resolve()));
    } else {
      const test = spawn(
        "bunx",
        ["playwright", "test", ...process.argv.slice(2)],
        { env: process.env, stdio: "inherit" },
      );
      const code = await new Promise<number>((resolve) =>
        test.on("exit", (value) => resolve(value ?? 1)),
      );
      if (code !== 0) console.error(serverLog);
      process.exitCode = code;
    }
  }
} finally {
  cleanup();
}
