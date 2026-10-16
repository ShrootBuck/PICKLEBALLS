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
  in_progress: "Building",
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

export function buildTVHeadline(queued: number, running: number) {
  if (queued >= 100) return "We may be here a while.";
  if (queued >= 10) return "The queue has a queue.";
  if (running) return "Fresh code on the way.";
  if (queued) return "Please form a line.";
  return "Nothing cooking.";
}
