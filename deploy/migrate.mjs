import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

// Keep one session-level lock across checksum verification and Prisma's process.
// Both containers use this lock; Prisma still takes its own advisory lock too.
if (process.env.PB_SELF_HOSTED !== "true" || !process.env.DIRECT_DATABASE_URL) {
  throw new Error(
    "Production migration runner requires self-hosted direct Postgres.",
  );
}
const db = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL });
let child;
let connectionLost = false;
db.on("error", () => {
  connectionLost = true;
  child?.kill("SIGTERM");
});
try {
  await db.connect();
  await db.query("SET lock_timeout = '10min'");
  await db.query("SELECT pg_advisory_lock(706269, 1)");
  const { rows: tables } = await db.query(
    "SELECT to_regclass('public._prisma_migrations') AS name",
  );
  if (tables[0].name) {
    const { rows } = await db.query(
      'SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    for (const { migration_name: name, checksum } of rows) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name))
        throw new Error("Invalid recorded migration name.");
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`);
      if (createHash("sha256").update(sql).digest("hex") !== checksum)
        throw new Error(
          `Previously deployed migration changed: ${name}. Add a new migration instead.`,
        );
    }
  }
  if (connectionLost) throw new Error("Migration lock connection was lost.");
  const code = await new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--config",
        "prisma.deploy.config.ts",
      ],
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  if (connectionLost || code !== 0)
    throw new Error("Production migration failed; refusing startup.");
} finally {
  await db.end();
}
