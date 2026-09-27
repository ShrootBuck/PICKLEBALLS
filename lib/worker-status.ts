import type { JobWithMetadata } from "pg-boss";
import { DomainError } from "@/lib/errors";
import type { JobPayloads } from "@/lib/queue";
import type { readScreenTime } from "@/lib/screen-time-server";

type ReadOutput =
  | { ok: true; reading: Awaited<ReturnType<typeof readScreenTime>> }
  | { ok: false; message: string };

export function isScreenTimeRunId(value: string | null): value is string {
  return value !== null && value.length > 0 && value.length <= 100;
}

export function localReadStatus(
  run: Pick<
    JobWithMetadata<JobPayloads["read-screen-time"]>,
    "name" | "data" | "state" | "output"
  > | null,
  userId: string,
  circleId: string,
) {
  if (
    !run ||
    run.name !== "read-screen-time" ||
    run.data.userId !== userId ||
    run.data.circleId !== circleId
  )
    throw new DomainError("That screenshot read is unavailable.", 404);
  if (["created", "retry", "active"].includes(run.state))
    return { pending: true as const };
  if (run.state !== "completed" || !run.output)
    return {
      error: "The screenshot reader could not finish. Try uploading again.",
    };
  const output = run.output as ReadOutput;
  return output.ok ? { reading: output.reading } : { error: output.message };
}
