import { setTimeout as sleep } from "node:timers/promises";

export type DeploymentResult = {
  status: "verified" | "failed";
  commit: string;
  checks: number;
  assets: number;
  elapsedSeconds: number;
  reason?: string;
};

class VerificationError extends Error {}

/** Public-path checks run on our server, after worker startup, without gating readiness. */
export async function verifyDeployment({
  origin,
  commit,
  startedAt = Date.now(),
  signal,
  timeoutMs = 20 * 60_000,
  stableMs = 60_000,
  intervalMs = 5_000,
  fetcher = fetch,
  now = Date.now,
  wait = (ms: number) => sleep(ms, undefined, { signal }),
}: {
  origin: string;
  commit: string;
  startedAt?: number;
  signal: AbortSignal;
  timeoutMs?: number;
  stableMs?: number;
  intervalMs?: number;
  fetcher?: typeof fetch;
  now?: () => number;
  wait?: (ms: number) => Promise<unknown>;
}): Promise<DeploymentResult> {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid release commit");
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password)
    throw new Error("Release verification requires a public HTTPS origin");
  let checks = 0;
  let assetCount = 0;
  let stableSince: number | undefined;
  let reason = "The release did not become ready before the deadline.";
  const result = (status: DeploymentResult["status"]): DeploymentResult => ({
    status,
    commit,
    checks,
    assets: assetCount,
    elapsedSeconds: Math.round((now() - startedAt) / 1000),
    ...(status === "failed" ? { reason } : {}),
  });
  async function request(path: string) {
    signal.throwIfAborted();
    checks++;
    const response = await fetcher(new URL(path, base.origin), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      headers: { "Cache-Control": "no-cache" },
      redirect: "error",
    });
    if (response.status !== 200)
      throw new VerificationError(
        `${path.split("?")[0]} returned HTTP ${response.status}.`,
      );
    return response;
  }
  while (now() - startedAt < timeoutMs) {
    signal.throwIfAborted();
    try {
      const health = await request("/api/health?release=1");
      const body = await health.json();
      if (
        body.status !== "ok" ||
        body.deployment !== commit ||
        body.worker?.status !== "ok" ||
        body.worker.deployment !== commit
      )
        throw new VerificationError(
          "Web and worker are not both healthy on the expected commit.",
        );
      if (!health.headers.get("cache-control")?.includes("no-store"))
        throw new VerificationError(
          "Release health response is missing no-store.",
        );

      const page = await request("/sign-in");
      const html = await page.text();
      if (html.match(/data-dpl-id="([^"]+)"/)?.[1] !== commit)
        throw new VerificationError(
          "The sign-in page is not serving the expected commit.",
        );
      const assets = [
        ...new Set(
          [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^" ]+)"/g)].map(
            (match) => match[1].replaceAll("&amp;", "&"),
          ),
        ),
      ];
      if (!assets.length)
        throw new VerificationError("The sign-in page has no static assets.");
      assetCount = assets.length;
      // Bound concurrency so verification stays small on the deployment laptop.
      for (let i = 0; i < assets.length; i += 4) {
        await Promise.all(
          assets.slice(i, i + 4).map(async (path) => {
            const response = await request(path);
            const contentType = response.headers.get("content-type") || "";
            if (
              !response.headers.get("cache-control")?.includes("immutable") ||
              contentType.includes("text/html") ||
              !(await response.arrayBuffer()).byteLength
            )
              throw new VerificationError(
                "A release asset is empty, HTML, or missing immutable caching.",
              );
          }),
        );
      }
      stableSince ??= now();
      if (now() - stableSince >= stableMs) return result("verified");
    } catch (error) {
      signal.throwIfAborted();
      stableSince = undefined;
      reason =
        error instanceof VerificationError
          ? error.message
          : "A public release check could not complete.";
    }
    await wait(
      Math.min(intervalMs, Math.max(0, timeoutMs - (now() - startedAt))),
    );
  }
  signal.throwIfAborted();
  return result("failed");
}

export async function notifyDeployment(
  webhook: string,
  result: DeploymentResult,
  signal: AbortSignal,
  fetcher = fetch,
) {
  let url: URL;
  try {
    url = new URL(webhook);
  } catch {
    throw new Error("Invalid deployment Discord webhook configuration");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "discord.com" ||
    !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)
  )
    throw new Error("Invalid deployment Discord webhook configuration");
  url.searchParams.set("wait", "true");
  const ok = result.status === "verified";
  const response = await fetcher(url, {
    method: "POST",
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: ok
            ? "Pickle Balls release verified"
            : "Pickle Balls release verification failed",
          color: ok ? 0x22c55e : 0xef4444,
          description: ok
            ? "Web and worker are healthy on the same commit. The public sign-in page and its static assets passed checks for at least 60 seconds."
            : result.reason,
          fields: [
            { name: "Commit", value: result.commit, inline: false },
            { name: "Checks", value: String(result.checks), inline: true },
            { name: "Assets", value: String(result.assets), inline: true },
            {
              name: "Verification time",
              value: `${result.elapsedSeconds}s`,
              inline: true,
            },
          ],
          url: `https://github.com/ShrootBuck/PICKLEBALLS/commit/${result.commit}`,
        },
      ],
    }),
  }).catch(() => {
    signal.throwIfAborted();
    throw new Error("Deployment notification request could not complete");
  });
  // Never include the webhook URL, response body, or credentials in errors/logs.
  if (!response.ok)
    throw new Error(`Deployment notification failed (HTTP ${response.status})`);
}
