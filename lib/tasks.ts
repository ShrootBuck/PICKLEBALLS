import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { sanitizeImage } from "@/lib/image";
import { getPrisma } from "@/lib/prisma";
import { commitmentInputSchema, proofReviewSchema } from "@/lib/schemas";
import { canEditTask, dailyTaskLimit, isLateProof } from "@/lib/task-policy";
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
      await transaction.commitmentRevision.create({
        data: {
          commitmentId: task.id,
          editorId: userId,
          title: task.title,
          definitionOfDone: task.definitionOfDone,
          dueAt: task.dueAt,
          status: task.status,
          revisionNote: "Created",
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

    await transaction.commitmentRevision.create({
      data: {
        commitmentId: current.id,
        editorId: userId,
        title: current.title,
        definitionOfDone: current.definitionOfDone,
        dueAt: current.dueAt,
        status: current.status,
        revisionNote: parsed.data.revisionNote || "Edited",
      },
    });
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
          include: { commitment: true, review: true },
        });
        if (!proof) throw new DomainError("Proof not found.", 404);
        if (proof.ownerId === reviewerId)
          throw new DomainError(
            "You cannot review your own homework. Nice try.",
            403,
          );
        if (proof.review)
          throw new DomainError("Somebody already called it.", 409);

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
        const approved = parsed.data.decision === "APPROVED";
        await transaction.taskProof.update({
          where: { id: proofId },
          data: { reviewStatus: approved ? "APPROVED" : "CHALLENGED" },
        });
        await transaction.commitment.update({
          where: { id: proof.commitmentId },
          data: { status: approved ? "VERIFIED" : "OPEN" },
        });
        await transaction.activityEvent.create({
          data: {
            circleId,
            actorId: reviewerId,
            kind: approved ? "PROOF_APPROVED" : "PROOF_CHALLENGED",
            entityId: proofId,
            summary: `${approved ? "approved" : "challenged"} proof for “${proof.commitment.title}”`,
          },
        });
        return review;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DomainError("Somebody already reviewed this proof.", 409);
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
  const checkIn = await getPrisma().checkIn.upsert({
    where: { userId_circleId_day: { userId, circleId, day } },
    update: { signal, blocker: blocker || null },
    create: { userId, circleId, day, signal, blocker: blocker || null },
  });
  await getPrisma().activityEvent.create({
    data: {
      circleId,
      actorId: userId,
      kind: "CHECK_IN_SET",
      entityId: checkIn.id,
      summary: `checked in ${signal.toLowerCase().replace("_", " ")}`,
    },
  });
  return checkIn;
}
