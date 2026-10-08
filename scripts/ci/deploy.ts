/** Runs only after CI passes. No production credentials or database access. */
import { appendFile } from "node:fs/promises";
import { matchesRelease, pageAssets, type Release } from "./release";

const commit = process.env.PB_RELEASE_COMMIT;
if (!commit || !/^[a-f0-9]{40}$/.test(commit))
  throw new Error("PB_RELEASE_COMMIT must be a full Git SHA.");
const origin = "https://pickle-balls.com";
const webBranch = "codex/production-web";
const workerBranch = "codex/production-worker";

function git(...args: string[]) {
  const result = Bun.spawnSync(["git", ...args]);
  if (result.exitCode !== 0)
    throw new Error(`git ${args[0]} failed: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

async function request(path: string) {
  const response = await fetch(new URL(path, origin), {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}

async function assets(paths: string[]) {
  for (const path of paths) {
    const response = await request(path);
    if (
      !response.headers.get("cache-control")?.includes("immutable") ||
      !(await response.arrayBuffer()).byteLength
    )
      throw new Error(`Missing or incorrectly cached asset: ${path}`);
  }
}

async function waitForRelease(worker: boolean) {
  const deadline = Date.now() + 20 * 60_000;
  let last = "No response";
  while (Date.now() < deadline) {
    try {
      const response = await request(
        worker ? "/api/health?release=1" : "/api/health",
      );
      const release = (await response.json()) as Release;
      if (!response.headers.get("cache-control")?.includes("no-store"))
        throw new Error("Health response must not be cached.");
      if (matchesRelease(release, commit as string, worker)) return;
      last = JSON.stringify(release);
    } catch (error) {
      last = String(error);
    }
    console.log(
      `Waiting for ${worker ? "web and worker" : "web"} ${commit}: ${last}`,
    );
    await Bun.sleep(10_000);
  }
  throw new Error(
    `Timed out waiting for ${worker ? "worker" : "web"}. ${last}. Check Coolify; no automatic rollback after migrations.`,
  );
}

function promote(branch: string) {
  // Fast-forward only: an old/retried job must never roll production backwards.
  git("fetch", "origin", branch);
  const previous = git("rev-parse", "FETCH_HEAD");
  git("merge-base", "--is-ancestor", previous, commit as string);
  if (previous === commit) {
    console.log(
      `${branch} already points at this release; checking whether it finished.`,
    );
    return;
  }
  git("push", "origin", `${commit}:refs/heads/${branch}`);
}

async function main() {
  git("fetch", "origin", "main");
  if (git("rev-parse", "FETCH_HEAD") !== commit) {
    console.log(
      "A newer main commit exists. Skipping this superseded release.",
    );
    return;
  }
  const old = pageAssets(await (await request("/sign-in")).text());
  await assets(old.assets);
  promote(webBranch);
  await waitForRelease(false);
  const current = pageAssets(await (await request("/sign-in")).text());
  if (current.deployment !== commit)
    throw new Error("Built page does not match the tested commit.");
  await assets([...new Set([...old.assets, ...current.assets])]);
  promote(workerBranch);
  await waitForRelease(true);
  // Require sustained readiness after both releases are up.
  for (let sample = 0; sample < 6; sample++) {
    const release = (await (
      await request("/api/health?release=1")
    ).json()) as Release;
    if (!matchesRelease(release, commit as string, true))
      throw new Error("Release became unhealthy during verification.");
    await assets([old.assets[sample % old.assets.length]]);
    await Bun.sleep(10_000);
  }
  console.log(`Verified web, worker, and retained assets for ${commit}.`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Deployed and verified \`${commit}\`: web, worker, database readiness, and retained assets.\n`,
    );
}

await main();
