export const dailyTaskLimit = 10;

// Every task needs one approval from someone else. Solo circles have no one
// to review, so proofs verify on post.
export function requiredApprovalsForCircle(circleSize: number) {
  if (circleSize <= 1) return 0;
  return 1;
}

// Single peer approval verifies a proof.
export const requiredApprovals = 1;

export function canEditTask(dueAt: Date, now = new Date()) {
  return now < dueAt;
}

export function isLateProof(dueAt: Date, submittedAt = new Date()) {
  return submittedAt > dueAt;
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
