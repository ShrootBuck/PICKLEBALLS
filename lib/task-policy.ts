// Every other current member must approve. Solo circles verify on post.
export function requiredApprovalsForCircle(circleSize: number) {
  return Math.max(0, circleSize - 1);
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
  proofCount: number,
  now = new Date(),
) {
  return (
    (status === "OPEN" || status === "RENEGOTIATED") &&
    dueAt < now &&
    proofCount === 0
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
  return { approvalCount: approved.size, requiredApprovals: peers.size };
}
