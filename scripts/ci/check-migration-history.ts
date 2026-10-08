/** Already-deployed migrations are immutable. New migrations belong in new folders. */
export function checkMigrationHistory(cwd = process.cwd()) {
  const reference = "refs/remotes/origin/codex/production-web";
  const exists = Bun.spawnSync(["git", "rev-parse", "--verify", reference], {
    cwd,
  });
  if (exists.exitCode !== 0) {
    throw new Error(
      "Missing production-web ref. Fetch full history and bootstrap the deployment branches before enabling CI.",
    );
  }
  const result = Bun.spawnSync(
    [
      "git",
      "diff",
      "--name-status",
      "--no-renames",
      "--diff-filter=MD",
      reference,
      "HEAD",
      "--",
      "prisma/migrations",
    ],
    { cwd },
  );
  if (result.exitCode !== 0)
    throw new Error("Could not compare migration history.");
  const changes = result.stdout.toString().trim();
  if (changes)
    throw new Error(
      `Previously deployed migrations were changed or removed. Add a new migration instead:\n${changes}`,
    );
  console.log("Previously deployed migration files are unchanged.");
}

if (import.meta.main) checkMigrationHistory();
