export function taskDeadline(createdAt: Date) {
  return new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
}

// Keep challenged tasks visible until replacement proof arrives.
export function currentTaskFilter(now = new Date()) {
  return {
    status: { not: "MISSED" as const },
    OR: [
      { dueAt: { gt: now } },
      {
        proofSubmittedAt: { not: null },
        status: { in: ["OPEN" as const, "RENEGOTIATED" as const] },
      },
    ],
  };
}

export const challengeWindowMs = 24 * 60 * 60 * 1000;

export function challengeDeadline(submittedAt: Date) {
  return new Date(submittedAt.getTime() + challengeWindowMs);
}

// Friends can dispute standing proof for a day after it posts.
export function canChallengeProof(
  proof: {
    ownerId: string;
    submittedAt: Date;
    isLate: boolean;
    replacedById: string | null;
    challenged: boolean;
    taskStatus: string;
  },
  viewerId: string,
  now = new Date(),
) {
  return (
    proof.ownerId !== viewerId &&
    !proof.isLate &&
    !proof.challenged &&
    proof.replacedById === null &&
    proof.taskStatus === "DONE" &&
    now < challengeDeadline(proof.submittedAt)
  );
}

export function canEditTask(dueAt: Date, now = new Date()) {
  return now < dueAt;
}

export function isLateProof(dueAt: Date, submittedAt = new Date()) {
  return submittedAt > dueAt;
}

export const replyEditWindowMs = 10 * 60 * 1000;

export function canEditReply(createdAt: Date, now = new Date()) {
  return now.getTime() - createdAt.getTime() <= replyEditWindowMs;
}

export function shouldMarkMissed(
  status: string,
  dueAt: Date,
  now = new Date(),
  proofSubmittedAt: Date | string | null = null,
) {
  return (
    !proofSubmittedAt &&
    ["OPEN", "RENEGOTIATED"].includes(status) &&
    dueAt <= now
  );
}

export function canSubmitProof(
  task: { dueAt: Date; proofSubmittedAt?: Date | null; status: string },
  now = new Date(),
) {
  return (
    task.status !== "MISSED" &&
    task.status !== "DONE" &&
    (canEditTask(task.dueAt, now) || !!task.proofSubmittedAt)
  );
}
