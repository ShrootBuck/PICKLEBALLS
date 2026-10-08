import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The immutable image stamp identifies the code, even if runtime envs change.
const stamp = resolve(process.cwd(), ".release-commit");
export const releaseCommit = existsSync(stamp)
  ? readFileSync(stamp, "utf8").trim()
  : process.env.SOURCE_COMMIT || null;
