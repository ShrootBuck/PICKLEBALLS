import { expect, test } from "bun:test";
import { Client } from "pg";

const url = process.env.DIRECT_DATABASE_URL;
if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  !url ||
  new URL(url).hostname !== "127.0.0.1"
)
  throw new Error(
    "Migration runner tests require disposable loopback Postgres.",
  );
function migrate() {
  const child = Bun.spawn(["node", "deploy/migrate.mjs"], {
    env: { ...process.env, PB_SELF_HOSTED: "true" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const result = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { child, result };
}

test("production runner waits for the shared lock and rejects rewritten migration history", async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  let pending: ReturnType<typeof migrate> | undefined;
  let original: { migration_name: string; checksum: string } | undefined;
  try {
    await db.query("SELECT pg_advisory_lock(706269, 1)");
    pending = migrate();
    let finished = false;
    pending.result.then(() => {
      finished = true;
    });
    // Observe the actual waiting lock instead of relying on subprocess timing.
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const { rows } = await db.query(
        "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=706269 AND objid=1 AND NOT granted",
      );
      if (rows.length) {
        waiting = true;
        break;
      }
      await Bun.sleep(50);
    }
    expect(waiting).toBe(true);
    expect(finished).toBe(false);
    await db.query("SELECT pg_advisory_unlock(706269, 1)");
    const [code, stdout, stderr] = await pending.result;
    expect({ code, errors: code ? stdout + stderr : "" }).toEqual({
      code: 0,
      errors: "",
    });
    const { rows } = await db.query(
      'SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name LIMIT 1',
    );
    original = rows[0];
    if (!original) throw new Error("Expected applied test migration.");
    await db.query(
      'UPDATE "_prisma_migrations" SET checksum=$1 WHERE migration_name=$2',
      ["0".repeat(64), original.migration_name],
    );
    const [badCode, , badError] = await migrate().result;
    expect(badCode).not.toBe(0);
    expect(badError).toContain("Previously deployed migration changed");
  } finally {
    pending?.child.kill();
    await db.query("SELECT pg_advisory_unlock_all()");
    if (original)
      await db.query(
        'UPDATE "_prisma_migrations" SET checksum=$1 WHERE migration_name=$2',
        [original.checksum, original.migration_name],
      );
    await db.end();
  }
}, 30000);
