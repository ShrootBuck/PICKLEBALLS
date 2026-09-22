export function taskDeadline(createdAt: Date) {
  return new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
}

// The board only contains tasks within their 24-hour window.
export function currentTaskFilter(now = new Date()) {
  return { dueAt: { gt: now }, status: { not: "MISSED" as const } };
}

export function reviewableCommitmentFilter(now = new Date()) {
  return {
    dueAt: { gt: now },
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
) {
  return (
    ["OPEN", "RENEGOTIATED", "AWAITING_REVIEW"].includes(status) && dueAt <= now
  );
}

export function proofApprovalProgress(
  ownerId: string,
  memberIds: string[],
  reviews: { reviewerId: string; decision: string }[],
) {
  const peers = new Set(memberIds.filter((id) => id !== ownerId));
  const approved = new Set(
    reviews
      .filter(
        (review) =>
          review.decision === "APPROVED" && peers.has(review.reviewerId),
      )
      .map((review) => review.reviewerId),
  );
  return {
    approvalCount: approved.size,
    requiredApprovals: requiredApprovalsForCircle(new Set(memberIds).size),
  };
}
