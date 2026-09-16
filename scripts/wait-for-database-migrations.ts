import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";

// Trigger and Vercel build concurrently on a push. Only Vercel applies SQL;
// the task build waits until its required migrations have finished.
export function pendingMigrations(required: string[], applied: string[]) {
  const completed = new Set(applied);
  return required.filter((name) => !completed.has(name));
}

export async function waitForDatabaseMigrations() {
  const connectionString = process.env.MIGRATION_CHECK_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Set TRIGGER_BUILD_MIGRATION_CHECK_DATABASE_URL in Trigger.dev before enabling the migration deployment check.",
    );
  }
  const required = readdirSync(resolve("prisma/migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  const deadline = Date.now() + 10 * 60_000;
  try {
    while (Date.now() < deadline) {
      const result = await pool.query<{ migration_name: string }>(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      );
      const pending = pendingMigrations(
        required,
        result.rows.map((row) => row.migration_name),
      );
      if (pending.length === 0) {
        console.log(
          "Database migrations are ready for this worker deployment.",
        );
        return;
      }
      console.log(`Waiting for Vercel migrations: ${pending.join(", ")}`);
      await setTimeout(5_000);
    }
    throw new Error(
      "Database migrations did not finish within 10 minutes. Fix the Vercel deployment, then retry this worker build.",
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  await waitForDatabaseMigrations();
}
