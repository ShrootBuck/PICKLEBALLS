import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { sanitizeImage } from "@/lib/image";
import { getPrisma } from "@/lib/prisma";
import { commitmentInputSchema, proofReviewSchema } from "@/lib/schemas";
import {
  canEditTask,
  dailyTaskLimit,
  isLateProof,
  requiredApprovals,
  requiredApprovalsForCircle,
} from "@/lib/task-policy";
import { phoenixDateKey, phoenixDayDueAt, requireDateKey } from "@/lib/time";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function reconcileMissedTasks(circleId: string, now = new Date()) {
  const candidates = await getPrisma().commitment.findMany({
    where: {
      circleId,
      dueAt: { lt: now },
      status: { in: ["OPEN", "RENEGOTIATED"] },
      proofs: { none: {} },
    },
    select: { id: true, userId: true, title: true },
  });
  if (candidates.length === 0) return { count: 0 };
  return getPrisma().$transaction(async (transaction) => {
    let count = 0;
    for (const task of candidates) {
      const updated = await transaction.commitment.updateMany({
        where: {
          id: task.id,
          status: { in: ["OPEN", "RENEGOTIATED"] },
          proofs: { none: {} },
        },
        data: { status: "MISSED" },
      });
      if (updated.count === 0) continue;
      count += 1;
      await transaction.activityEvent.create({
        data: {
          circleId,
          actorId: task.userId,
          kind: "TASK_MISSED",
          entityId: task.id,
          summary: `missed “${task.title}” with no proof`,
        },
      });
    }
    return { count };
  });
}

export async function createCommitment(
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = commitmentInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("Fix the task fields.");
  const dayKey = phoenixDateKey(now);
  const day = requireDateKey(dayKey);
  const dueAt = phoenixDayDueAt(dayKey);
  if (!dueAt) throw new DomainError("Could not compute midnight deadline.");
  if (dueAt <= now) {
    throw new DomainError("Too late — today's board is locked at midnight.");
  }

  return getPrisma().$transaction(
    async (transaction) => {
      const count = await transaction.commitment.count({
        where: { userId, circleId, day },
      });
      if (count >= dailyTaskLimit) {
        throw new DomainError(
          `Limit is ${dailyTaskLimit} tasks. Finish something before adding more.`,
          409,
        );
      }
      const task = await transaction.commitment.create({
        data: {
          userId,
          circleId,
          day,
          title: parsed.data.title,
          definitionOfDone: parsed.data.definitionOfDone,
          dueAt,
        },
      });
      await transaction.activityEvent.create({
        data: {
          circleId,
          actorId: userId,
          kind: "TASK_CREATED",
          entityId: task.id,
          summary: `set “${task.title}” for ${dayKey}`,
        },
      });
      return task;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateCommitment(
  taskId: string,
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = commitmentInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("Fix the task fields.");

  return getPrisma().$transaction(async (transaction) => {
    const current = await transaction.commitment.findFirst({
      where: { id: taskId, userId, circleId },
    });
    if (!current) throw new DomainError("Task not found.", 404);
    if (!canEditTask(current.dueAt, now)) {
      throw new DomainError(
        "Midnight passed — the edit window is closed.",
        409,
      );
    }

    const task = await transaction.commitment.update({
      where: { id: current.id },
      data: {
        title: parsed.data.title,
        definitionOfDone: parsed.data.definitionOfDone,
        status: "RENEGOTIATED",
      },
    });
    await transaction.activityEvent.create({
      data: {
        circleId,
        actorId: userId,
        kind: "TASK_RENEGOTIATED",
        entityId: task.id,
        summary: `renegotiated “${task.title}” before midnight`,
      },
    });
    return task;
  });
}

export async function submitProof(
  taskId: string,
  userId: string,
  circleId: string,
  file: File,
  ownerNote: string | null,
  now = new Date(),
) {
  if (ownerNote && ownerNote.length > 500)
    throw new DomainError("Keep the proof note under 500 characters.");
  const image = await sanitizeImage(file);

  return getPrisma().$transaction(async (transaction) => {
    const task = await transaction.commitment.findFirst({
      where: { id: taskId, userId, circleId },
      include: {
        proofs: {
          where: { replacedById: null },
          orderBy: { submittedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!task) throw new DomainError("Task not found.", 404);
    const currentProof = task.proofs[0];
    if (currentProof && currentProof.reviewStatus !== "CHALLENGED") {
      throw new DomainError(
        "This task already has proof waiting on a verdict.",
        409,
      );
    }

    const proof = await transaction.taskProof.create({
      data: {
        commitmentId: task.id,
        ownerId: userId,
        circleId,
        ownerNote: ownerNote || null,
        submittedAt: now,
        isLate: isLateProof(task.dueAt, now),
        image: { create: image },
      },
    });
    if (currentProof) {
      await transaction.taskProof.update({
        where: { id: currentProof.id },
        data: { replacedById: proof.id },
      });
    }
    const memberCount = await transaction.membership.count({
      where: { circleId },
    });
    const needed = requiredApprovalsForCircle(memberCount);
    if (needed === 0) {
      // Solo circle: no peers to review, so the proof verifies on post.
      await transaction.taskProof.update({
        where: { id: proof.id },
        data: { reviewStatus: "APPROVED" },
      });
      await transaction.commitment.update({
        where: { id: task.id },
        data: { status: "VERIFIED" },
      });
      await transaction.activityEvent.create({
        data: {
          circleId,
          actorId: userId,
          kind: "PROOF_APPROVED",
          entityId: proof.id,
          summary: `verified proof for “${task.title}” (solo circle)`,
        },
      });
      return { ...proof, reviewStatus: "APPROVED" as const };
    }
    await transaction.commitment.update({
      where: { id: task.id },
      data: { status: "AWAITING_REVIEW" },
    });
    await transaction.activityEvent.create({
      data: {
        circleId,
        actorId: userId,
        kind: "PROOF_SUBMITTED",
        entityId: proof.id,
        summary: `${currentProof ? "replaced" : "submitted"} proof for “${task.title}”${proof.isLate ? " — late" : ""}`,
      },
    });
    return proof;
  });
}

export { requiredApprovals, requiredApprovalsForCircle };
export async function reviewProof(
  proofId: string,
  reviewerId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = proofReviewSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("Challenges need a useful note.");

  try {
    return await getPrisma().$transaction(
      async (transaction) => {
        const proof = await transaction.taskProof.findFirst({
          where: { id: proofId, circleId, replacedById: null },
          include: { commitment: true, reviews: true },
        });
        if (!proof) throw new DomainError("Proof not found.", 404);
        if (proof.ownerId === reviewerId)
          throw new DomainError(
            "You cannot review your own homework. Nice try.",
            403,
          );
        if (proof.reviewStatus !== "PENDING") {
          throw new DomainError("This proof already has a verdict.", 409);
        }
        if (proof.reviews.some((r) => r.reviewerId === reviewerId)) {
          throw new DomainError("You already reviewed this proof.", 409);
        }
        const isChallenge = parsed.data.decision === "CHALLENGED";

        const review = await transaction.taskProofReview.create({
          data: {
            proofId,
            reviewerId,
            circleId,
            decision: parsed.data.decision,
            note: parsed.data.note || null,
            createdAt: now,
          },
        });

        if (isChallenge) {
          await transaction.taskProof.update({
            where: { id: proofId },
            data: { reviewStatus: "CHALLENGED" },
          });
          await transaction.commitment.update({
            where: { id: proof.commitmentId },
            data: { status: "OPEN" },
          });
          await transaction.activityEvent.create({
            data: {
              circleId,
              actorId: reviewerId,
              kind: "PROOF_CHALLENGED",
              entityId: proofId,
              summary: `challenged proof for “${proof.commitment.title}”`,
            },
          });
          return review;
        }

        const approvals =
          proof.reviews.filter((r) => r.decision === "APPROVED").length + 1;
        const memberCount = await transaction.membership.count({
          where: { circleId },
        });
        const needed = requiredApprovalsForCircle(memberCount);

        if (approvals >= needed) {
          await transaction.taskProof.update({
            where: { id: proofId },
            data: { reviewStatus: "APPROVED" },
          });
          await transaction.commitment.update({
            where: { id: proof.commitmentId },
            data: { status: "VERIFIED" },
          });
          await transaction.activityEvent.create({
            data: {
              circleId,
              actorId: reviewerId,
              kind: "PROOF_APPROVED",
              entityId: proofId,
              summary: `approved proof for “${proof.commitment.title}” (${approvals}/${needed})`,
            },
          });
        } else {
          // Keep pending, still needs more approvals
          await transaction.activityEvent.create({
            data: {
              circleId,
              actorId: reviewerId,
              kind: "PROOF_APPROVED",
              entityId: proofId,
              summary: `approved proof for “${proof.commitment.title}” (${approvals}/${needed}) — needs ${needed - approvals} more`,
            },
          });
        }
        return review;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DomainError("You already reviewed this proof.", 409);
    }
    throw error;
  }
}

export async function setCheckIn(
  userId: string,
  circleId: string,
  signal: "WORKING" | "CLEAR" | "AT_RISK",
  blocker?: string,
  now = new Date(),
) {
  const day = requireDateKey(phoenixDateKey(now));
  const cleanBlocker = blocker?.trim() ? blocker.trim().slice(0, 500) : null;
  const result = await getPrisma().$transaction(async (transaction) => {
    const checkIn = await transaction.checkIn.upsert({
      where: { userId_circleId_day: { userId, circleId, day } },
      update: { signal, blocker: cleanBlocker },
      create: { userId, circleId, day, signal, blocker: cleanBlocker },
    });
    // Append-only log. Old posts stay. Current row stays the single source for replies.
    const update = await transaction.checkInUpdate.create({
      data: {
        checkInId: checkIn.id,
        userId,
        circleId,
        day,
        signal,
        blocker: cleanBlocker,
      },
    });
    await transaction.activityEvent.create({
      data: {
        circleId,
        actorId: userId,
        kind: "CHECK_IN_SET",
        entityId: checkIn.id,
        summary: `checked in ${signal.toLowerCase().replaceAll("_", " ")}`,
        metadata: { updateId: update.id, signal },
      },
    });
    return { checkIn, update };
  });
  return result.checkIn;
}

export async function getCheckInHistory(
  userId: string,
  circleId: string,
  dayKey: string,
  limit = 20,
) {
  const day = requireDateKey(dayKey);
  const [checkIn, updates] = await Promise.all([
    getPrisma().checkIn.findUnique({
      where: { userId_circleId_day: { userId, circleId, day } },
    }),
    getPrisma().checkInUpdate.findMany({
      where: { userId, circleId, day },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);
  // Smooth backfill for display: old check-ins from before history existed still show.
  if (updates.length === 0 && checkIn) {
    return [
      {
        id: checkIn.id,
        signal: checkIn.signal,
        blocker: checkIn.blocker,
        createdAt: checkIn.updatedAt,
      },
    ];
  }
  return updates.map((update) => ({
    id: update.id,
    signal: update.signal,
    blocker: update.blocker,
    createdAt: update.createdAt,
  }));
}
