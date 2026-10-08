import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Coolify provides SOURCE_COMMIT as a BuildKit secret; other builds use a build argument.
// Stamp it during RUN, where either mechanism is available, not in Docker ENV.
const commit = existsSync("/run/secrets/SOURCE_COMMIT")
  ? readFileSync("/run/secrets/SOURCE_COMMIT", "utf8").trim()
  : process.env.SOURCE_COMMIT;
if (!commit || !/^[a-f0-9]{40}$/.test(commit)) {
  throw new Error("Build requires SOURCE_COMMIT with the full Git SHA.");
}
writeFileSync(".release-commit", `${commit}\n`);
