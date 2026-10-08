import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkMigrationHistory } from "../scripts/ci/check-migration-history";

test("CI allows new migrations but rejects rewriting already-deployed SQL", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pb-migration-history-"));
  function git(...args: string[]) {
    const result = Bun.spawnSync(["git", ...args], { cwd });
    if (result.exitCode) throw new Error(result.stderr.toString());
  }
  function commit() {
    git("add", ".");
    git(
      "-c",
      "user.name=CI Test",
      "-c",
      "user.email=ci@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
  }
  try {
    git("init", "-q");
    await mkdir(join(cwd, "prisma/migrations/001"), { recursive: true });
    await writeFile(
      join(cwd, "prisma/migrations/001/migration.sql"),
      "SELECT 1;\n",
    );
    commit();
    git("update-ref", "refs/remotes/origin/codex/production-web", "HEAD");
    await mkdir(join(cwd, "prisma/migrations/002"));
    await writeFile(
      join(cwd, "prisma/migrations/002/migration.sql"),
      "SELECT 2;\n",
    );
    commit();
    expect(() => checkMigrationHistory(cwd)).not.toThrow();
    await writeFile(
      join(cwd, "prisma/migrations/001/migration.sql"),
      "SELECT 3;\n",
    );
    commit();
    expect(() => checkMigrationHistory(cwd)).toThrow(
      "Previously deployed migrations",
    );
    await rm(join(cwd, "prisma/migrations/001/migration.sql"));
    commit();
    expect(() => checkMigrationHistory(cwd)).toThrow(
      "Previously deployed migrations",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
