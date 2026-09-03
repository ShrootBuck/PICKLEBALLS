export const dailyTaskLimit = 10;

// Approvals needed scale with circle size: floor(n / 2), at least 1 when
// peers exist. Solo circles have no one to review, so proofs verify on post.
export function requiredApprovalsForCircle(circleSize: number) {
  if (circleSize <= 1) return 0;
  return Math.min(circleSize - 1, Math.max(1, Math.floor(circleSize / 2)));
}

// Back-compat default for the seeded 4-person squad (floor(4/2) = 2).
export const requiredApprovals = 2;

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
