/** Public release metadata only. Never return internal URLs or fetch errors. */
export async function workerRelease(url: string | undefined) {
  if (!url) return null;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
      redirect: "error",
    });
    const body = await response.json();
    return response.ok &&
      body.status === "ok" &&
      typeof body.deployment === "string" &&
      /^[a-f0-9]{40}$/.test(body.deployment)
      ? { status: "ok" as const, deployment: body.deployment }
      : null;
  } catch {
    return null;
  }
}
