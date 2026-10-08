export type Release = {
  status: string;
  deployment?: string | null;
  worker?: { status: string; deployment: string } | null;
};

export function matchesRelease(
  release: Release,
  commit: string,
  worker: boolean,
) {
  return (
    release.status === "ok" &&
    release.deployment === commit &&
    (!worker ||
      (release.worker?.status === "ok" && release.worker.deployment === commit))
  );
}

export function pageAssets(html: string) {
  const deployment = html.match(/data-dpl-id="([^"]+)"/)?.[1];
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^" ]+)"/g)].map(
        (match) => match[1].replaceAll("&amp;", "&"),
      ),
    ),
  ];
  if (!deployment || !assets.length)
    throw new Error("Sign-in page has no deployment ID or static assets.");
  return { deployment, assets };
}
