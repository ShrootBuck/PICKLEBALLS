import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Dependencies are installed with a frozen integrity-checked lockfile and no
// lifecycle scripts. Generated Prisma code is included in the source hash.
const excluded = new Set(["node_modules", ".next", ".checks-passed"]);
export function fingerprint(root, toolchain) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(toolchain));
  function walk(relative) {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (!relative && excluded.has(name)) continue;
      const path = join(relative, name);
      const stat = lstatSync(join(root, path));
      hash.update(JSON.stringify([path, stat.mode]));
      if (stat.isDirectory()) walk(path);
      else if (stat.isSymbolicLink())
        hash.update(JSON.stringify(readlinkSync(join(root, path))));
      else
        hash.update(
          createHash("sha256")
            .update(readFileSync(join(root, path)))
            .digest(),
        );
    }
  }
  walk("");
  return hash.digest("hex");
}

export function validate({ root, cache, toolchain, check }) {
  const key = fingerprint(root, toolchain);
  const receipt = join(cache, key);
  if (existsSync(receipt) && readFileSync(receipt, "utf8") === key) {
    console.log(`Reusing successful validation ${key}`);
  } else {
    console.log(`Running validation ${key}`);
    check(); // A failure must never publish a success receipt.
    writeFileSync(receipt, key);
  }
  writeFileSync(join(root, ".checks-passed"), `${key}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  validate({
    root: "/app",
    cache: "/var/cache/pickleballs-checks",
    toolchain: {
      epoch: process.env.PB_CHECK_CACHE_EPOCH,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      bun: execFileSync("bun", ["--version"], { encoding: "utf8" }),
      packages: execFileSync(
        "dpkg-query",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: dpkg's format syntax, not JavaScript interpolation.
        ["-W", "-f=${Package} ${Version} ${Architecture}\n"],
        { encoding: "utf8" },
      ),
    },
    check() {
      const result = spawnSync("sh", ["deploy/check-build.sh"], {
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `Build validation failed (${result.signal ?? result.status})`,
        );
    },
  });
}
