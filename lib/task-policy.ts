export function taskDeadline(createdAt: Date) {
  return new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
}

// Keep unfinished, timely submissions visible until their review is resolved.
export function currentTaskFilter(now = new Date()) {
  return {
    status: { not: "MISSED" as const },
    OR: [
      { dueAt: { gt: now } },
      {
        proofSubmittedAt: { not: null },
        status: {
          in: [
            "OPEN" as const,
            "RENEGOTIATED" as const,
            "AWAITING_REVIEW" as const,
          ],
        },
      },
    ],
  };
}

export function reviewableCommitmentFilter() {
  return {
    status: { notIn: ["MISSED" as const, "VERIFIED" as const] },
  };
}

// Half the current circle, rounded down. Solo circles verify on post.
export function requiredApprovalsForCircle(circleSize: number) {
  return Math.max(0, Math.floor(circleSize / 2));
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

export function proofApprovalProgress(
  ownerId: string,
  memberIds: string[],
  reviews: { reviewerId: string; decision: string }[],
  requiredApprovals?: number | null,
) {
  const peers = new Set(memberIds.filter((id) => id !== ownerId));
  const approved = new Set(
    reviews
      .filter(
        (review) =>
          review.decision === "APPROVED" &&
          review.reviewerId !== ownerId &&
          (requiredApprovals != null || peers.has(review.reviewerId)),
      )
      .map((review) => review.reviewerId),
  );
  return {
    approvalCount: approved.size,
    requiredApprovals:
      requiredApprovals ?? requiredApprovalsForCircle(new Set(memberIds).size),
  };
}

export function canSubmitProof(
  task: { dueAt: Date; proofSubmittedAt?: Date | null; status: string },
  now = new Date(),
) {
  return (
    task.status !== "MISSED" &&
    task.status !== "VERIFIED" &&
    (canEditTask(task.dueAt, now) || !!task.proofSubmittedAt)
  );
}
