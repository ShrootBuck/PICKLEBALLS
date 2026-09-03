import {
  addDays,
  isPlannableDay,
  phoenixDateKey,
  phoenixDateTime,
} from "@/lib/time";

export const dailyTaskLimit = 10;

export const requiredApprovals = 2;

export function validateTaskTiming(
  day: string,
  dueTime: string,
  now = new Date(),
) {
  if (!isPlannableDay(day, now)) {
    return {
      ok: false as const,
      error: `Plan for today through ${addDays(phoenixDateKey(now), 7)}.`,
    };
  }
  const dueAt = phoenixDateTime(day, dueTime);
  if (!dueAt) return { ok: false as const, error: "That due time is invalid." };
  if (dueAt <= now) {
    return {
      ok: false as const,
      error: "The deadline must still be in the future.",
    };
  }
  return { ok: true as const, dueAt };
}

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
