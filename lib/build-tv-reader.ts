import { z } from "zod";
import {
  BUILD_TV_STALE_MS,
  type BuildSnapshot,
  type BuildTVResponse,
  buildStatusSchema,
} from "./build-tv";

export type BuildTVConfig = {
  apiUrl: string;
  token: string;
  webUuid: string;
  workerUuid: string;
};

// Parse only fields needed for the spectator view. Never forward Coolify objects,
// logs, server names, configuration, or upstream error bodies.
// Only the commit subject is exposed, never its extended body.
const deploymentSchema = z.object({
  application_id: z
    .union([z.string().min(1), z.number().int()])
    .transform(String),
  deployment_uuid: z.string().regex(/^[\w-]{1,100}$/),
  status: buildStatusSchema,
  pull_request_id: z.coerce.number().int().default(0),
  commit: z.string().nullish(),
  commit_message: z.string().nullish(),
  created_at: z.string().refine((date) => Number.isFinite(Date.parse(date))),
});
const deploymentsSchema = z.array(deploymentSchema);
const historySchema = z.object({ deployments: deploymentsSchema });

export function createBuildTVReader({
  config,
  fetcher = fetch,
  now = Date.now,
}: {
  config: BuildTVConfig | null;
  fetcher?: typeof fetch;
  now?: () => number;
}) {
  let snapshot: BuildSnapshot | null = null;
  let expires = 0;
  let connected = false;
  let pending: Promise<BuildTVResponse> | null = null;

  function result(): BuildTVResponse {
    const recent =
      snapshot && now() - Date.parse(snapshot.updatedAt) <= BUILD_TV_STALE_MS
        ? snapshot
        : null;
    return {
      connection: connected ? "connected" : recent ? "reconnecting" : "offline",
      snapshot: recent,
    };
  }

  async function refresh(): Promise<BuildTVResponse> {
    if (!config) return { connection: "unconfigured", snapshot: null };
    try {
      const base = new URL(`${config.apiUrl.replace(/\/$/, "")}/`);
      if (
        !["http:", "https:"].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash
      )
        throw new Error("Invalid Coolify configuration");
      if (
        ![config.webUuid, config.workerUuid].every((uuid) =>
          /^[\w-]{1,100}$/.test(uuid),
        ) ||
        config.webUuid === config.workerUuid
      )
        throw new Error("Invalid Coolify applications");

      async function get(path: string) {
        const response = await fetcher(new URL(path, base), {
          headers: {
            Authorization: `Bearer ${config?.token}`,
            Accept: "application/json",
          },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) throw new Error("Coolify unavailable");
        return response.json();
      }
      const [queueBody, webBody, workerBody] = await Promise.all([
        get("deployments"),
        get(`deployments/applications/${config.webUuid}?take=5`),
        get(`deployments/applications/${config.workerUuid}?take=5`),
      ]);
      // Laravel collections may retain numeric keys after sorting.
      const queue = deploymentsSchema.parse(
        !Array.isArray(queueBody) &&
          queueBody &&
          typeof queueBody === "object" &&
          Object.keys(queueBody).every((key) => /^\d+$/.test(key))
          ? Object.values(queueBody)
          : queueBody,
      );
      const histories = [webBody, workerBody].map(
        (body) => historySchema.parse(body).deployments,
      );
      const services = histories.map((history, index) => {
        const applicationId = history[0]?.application_id;
        if (history.some((build) => build.application_id !== applicationId))
          throw new Error("Inconsistent Coolify application");
        const active = [
          ...new Map(
            queue
              .filter(
                (build) =>
                  build.application_id === applicationId &&
                  build.pull_request_id === 0,
              )
              .map((build) => [build.deployment_uuid, build]),
          ).values(),
        ];
        const latest = history
          .filter((build) => build.pull_request_id === 0)
          .sort(
            (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
          )[0];
        return {
          key: index === 0 ? ("web" as const) : ("worker" as const),
          queued: active.filter((build) => build.status === "queued").length,
          running: active.filter((build) => build.status === "in_progress")
            .length,
          latest: latest
            ? {
                id: latest.deployment_uuid,
                status: latest.status,
                commit:
                  latest.commit && /^[a-f0-9]{40}$/i.test(latest.commit)
                    ? latest.commit.slice(0, 7)
                    : null,
                commitMessage:
                  latest.commit_message
                    ?.trim()
                    .split(/\r?\n/, 1)[0]
                    ?.trim()
                    .slice(0, 300) || null,
                createdAt: new Date(latest.created_at).toISOString(),
              }
            : null,
        };
      });
      snapshot = {
        updatedAt: new Date(now()).toISOString(),
        queued: services.reduce((sum, service) => sum + service.queued, 0),
        running: services.reduce((sum, service) => sum + service.running, 0),
        services,
      };
      connected = true;
    } catch {
      connected = false;
    }
    // Cache failures too, and coalesce viewers into one upstream request batch.
    expires = now() + 10_000;
    return result();
  }

  return function read(): Promise<BuildTVResponse> {
    if (!config)
      return Promise.resolve({ connection: "unconfigured", snapshot: null });
    if (pending) return pending;
    if (now() < expires) return Promise.resolve(result());
    pending = refresh().finally(() => {
      pending = null;
    });
    return pending;
  };
}
