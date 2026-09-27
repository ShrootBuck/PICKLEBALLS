/** Read-only public smoke check. --watch verifies a subsequent deployment handoff. */
const origin = process.env.PB_VERIFY_ORIGIN || "https://pickle-balls.com";
const watch = process.argv.includes("--watch");
const timeoutMs = Number(process.env.PB_VERIFY_TIMEOUT_MS || 900_000);
const started = Date.now();
const failures: { at: string; check: string; error: string }[] = [];
let checks = 0;
async function request(path: string) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(10_000),
    headers: { "Cache-Control": "no-cache" },
    redirect: "manual",
  });
  checks++;
  if (response.status !== 200)
    throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}
async function page() {
  const html = await (await request("/sign-in")).text();
  const id = html.match(/data-dpl-id="([^"]+)"/)?.[1];
  if (!id) throw new Error("Built page has no deployment ID");
  const assets = [
    ...html.matchAll(/(?:src|href)="(\/_next\/static\/[^" ]+)"/g),
  ].map((match) => match[1].replaceAll("&amp;", "&"));
  if (!assets.length) throw new Error("Built page has no static assets");
  return { id, assets: [...new Set(assets)] };
}
async function asset(path: string) {
  const response = await request(path);
  if (!response.headers.get("cache-control")?.includes("immutable"))
    throw new Error(`${path}: missing immutable caching`);
  if (!(await response.arrayBuffer()).byteLength)
    throw new Error(`${path}: empty asset`);
}
async function checked(name: string, fn: () => Promise<unknown>) {
  try {
    return await fn();
  } catch (error) {
    const failure = {
      at: new Date().toISOString(),
      check: name,
      error: String(error),
    };
    failures.push(failure);
    console.error(JSON.stringify(failure));
    return undefined;
  }
}
const initial = await page();
await Promise.all(
  initial.assets.map((path) => checked("initial asset", () => asset(path))),
);
console.log(
  JSON.stringify({
    event: "baseline",
    origin,
    deployment: initial.id,
    assets: initial.assets.length,
  }),
);
let current = initial;
let changedAt: number | undefined;
let iteration = 0;
do {
  await checked("health", async () => {
    const response = await request("/api/health");
    if ((await response.json()).status !== "ok")
      throw new Error("Unhealthy body");
    if (!response.headers.get("cache-control")?.includes("no-store"))
      throw new Error("Health response must not be cached");
  });
  await checked("old asset", () =>
    asset(initial.assets[iteration++ % initial.assets.length]),
  );
  const next = (await checked("page", page)) as typeof initial | undefined;
  if (next) {
    current = next;
    if (current.id !== initial.id && !changedAt) {
      changedAt = Date.now();
      console.log(
        JSON.stringify({
          event: "release-changed",
          from: initial.id,
          to: current.id,
        }),
      );
    }
  }
  if (!watch || (changedAt && Date.now() - changedAt >= 60_000)) break;
  await Bun.sleep(1_000);
} while (Date.now() - started < timeoutMs);
await Promise.all(
  [...new Set([...initial.assets, ...current.assets])].map((path) =>
    checked("final asset", () => asset(path)),
  ),
);
if (watch && !changedAt)
  failures.push({
    at: new Date().toISOString(),
    check: "deployment",
    error: "No new release observed before timeout",
  });
const result = {
  event: "summary",
  origin,
  before: initial.id,
  after: current.id,
  elapsedSeconds: Math.round((Date.now() - started) / 1000),
  checks,
  failures,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = failures.length ? 1 : 0;

export {};
