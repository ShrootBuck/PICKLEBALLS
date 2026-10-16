import { z } from "zod";

export const buildStatusSchema = z.enum([
  "queued",
  "in_progress",
  "finished",
  "failed",
  "cancelled-by-user",
]);
export type BuildStatus = z.infer<typeof buildStatusSchema>;
export const buildStatusLabels: Record<BuildStatus, string> = {
  queued: "Queued",
  in_progress: "Updating",
  finished: "Finished",
  failed: "Failed",
  "cancelled-by-user": "Cancelled",
};

const buildSchema = z.object({
  id: z.string(),
  status: buildStatusSchema,
  commit: z.string().nullable(),
  commitMessage: z.string().nullable(),
  createdAt: z.string(),
});

export const buildTVResponseSchema = z.object({
  connection: z.enum(["connected", "reconnecting", "offline", "unconfigured"]),
  snapshot: z
    .object({
      updatedAt: z.string(),
      queued: z.number().int().nonnegative(),
      running: z.number().int().nonnegative(),
      services: z.array(
        z.object({
          key: z.enum(["web", "worker"]),
          queued: z.number().int().nonnegative(),
          running: z.number().int().nonnegative(),
          builds: z.array(buildSchema),
        }),
      ),
    })
    .nullable(),
});
export type BuildTVResponse = z.infer<typeof buildTVResponseSchema>;
export type BuildSnapshot = NonNullable<BuildTVResponse["snapshot"]>;
export const BUILD_TV_STALE_MS = 2 * 60_000;

type Build = z.infer<typeof buildSchema>;

export function buildTVUpdates(services: BuildSnapshot["services"]) {
  const groups = new Map<string, Map<string, Build>>();
  for (const service of services) {
    for (const build of service.builds) {
      // Unknown commits cannot safely be paired across services.
      const key = build.commit ?? `${service.key}-${build.id}`;
      const group = groups.get(key) ?? new Map<string, Build>();
      const previous = group.get(service.key);
      // A retry replaces that service's earlier result for the same commit.
      if (
        !previous ||
        Date.parse(build.createdAt) > Date.parse(previous.createdAt)
      )
        group.set(service.key, build);
      groups.set(key, group);
    }
  }
  return [...groups].map(([id, group]) => {
    const builds = [...group.values()].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
    const statuses = builds.map((build) => build.status);
    const status: BuildStatus = statuses.includes("failed")
      ? "failed"
      : statuses.includes("in_progress") ||
          (statuses.includes("finished") && statuses.includes("queued"))
        ? "in_progress"
        : statuses.includes("queued")
          ? "queued"
          : statuses.includes("cancelled-by-user")
            ? "cancelled-by-user"
            : "finished";
    return {
      id,
      commit: builds[0].commit,
      commitMessage:
        builds.find((build) => build.commitMessage)?.commitMessage ?? null,
      createdAt: builds[0].createdAt,
      status,
    };
  });
}

export function buildTVHeadline(queued: number, running: number) {
  if (queued >= 100) return "We may be here a while.";
  if (queued >= 10) return "The queue has a queue.";
  if (running) return "Fresh code on the way.";
  if (queued) return "Please form a line.";
  return "Nothing cooking.";
}
