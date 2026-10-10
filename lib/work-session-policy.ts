import type { SocialTask } from "@/lib/social-types";

export type WorkSessionView = {
  id: string;
  taskId: string;
  circleId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
};

export function canTrackTask(
  task: Pick<SocialTask, "status" | "dueAt" | "proofSubmittedAt" | "proof">,
  now = Date.now(),
) {
  return (
    ["OPEN", "RENEGOTIATED"].includes(task.status) &&
    (new Date(task.dueAt).getTime() > now || !!task.proofSubmittedAt) &&
    (!task.proof || task.proof.reviewStatus === "CHALLENGED") &&
    (!task.proofSubmittedAt || task.proof?.reviewStatus === "CHALLENGED")
  );
}

export function elapsedMilliseconds(
  session: Pick<WorkSessionView, "startedAt" | "endedAt">,
  now = Date.now(),
) {
  return Math.max(
    0,
    (session.endedAt ? Date.parse(session.endedAt) : now) -
      Date.parse(session.startedAt),
  );
}

export function formatStopwatch(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function summarizeWorkSessions(sessions: WorkSessionView[]) {
  const finished = sessions.filter((session) => session.endedAt);
  return {
    count: finished.length,
    milliseconds: finished.reduce(
      (sum, session) => sum + elapsedMilliseconds(session),
      0,
    ),
    startedAt: finished.length
      ? finished.reduce(
          (first, session) =>
            session.startedAt < first ? session.startedAt : first,
          finished[0].startedAt,
        )
      : null,
    endedAt: finished.length
      ? finished.reduce(
          (last, session) =>
            session.endedAt && session.endedAt > last ? session.endedAt : last,
          finished[0].endedAt as string,
        )
      : null,
  };
}
