import "server-only";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { serializable } from "@/lib/transaction";
import { canTrackTask, type WorkSessionView } from "@/lib/work-session-policy";

const include = { commitment: { select: { title: true } } } as const;
type SessionRow = Prisma.WorkSessionGetPayload<{ include: typeof include }>;

export function toWorkSession(session: SessionRow): WorkSessionView {
  return {
    id: session.id,
    taskId: session.commitmentId,
    circleId: session.circleId,
    title: session.commitment.title,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    updatedAt: session.updatedAt.toISOString(),
  };
}

async function requireMember(
  tx: Prisma.TransactionClient,
  userId: string,
  circleId: string,
) {
  const member = await tx.membership.findUnique({
    where: { userId_circleId: { userId, circleId } },
  });
  if (!member)
    throw new DomainError("You are no longer a member of this circle.", 403);
}

export async function getActiveWorkSession(userId: string) {
  const session = await getPrisma().workSession.findUnique({
    where: { runningUserId: userId },
    include,
  });
  return session ? toWorkSession(session) : null;
}

export async function listWorkSessions(
  userId: string,
  circleId: string,
  taskId: string,
) {
  const task = await getPrisma().commitment.findFirst({
    where: {
      id: taskId,
      userId,
      circleId,
      circle: { memberships: { some: { userId } } },
    },
    select: { id: true },
  });
  if (!task) throw new DomainError("Task not found.", 404);
  return (
    await getPrisma().workSession.findMany({
      where: { userId, circleId, commitmentId: taskId },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      include,
    })
  ).map(toWorkSession);
}

const startSchema = z.object({
  id: z.uuid(),
  taskId: z.string().min(1).max(100),
  circleId: z.string().min(1).max(100),
});

export async function startWorkSession(
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("Choose a task to start.");
  const data = parsed.data;
  if (data.circleId !== circleId)
    throw new DomainError("Your circle changed. Refresh and try again.", 409);
  try {
    return await serializable(async (tx) => {
      await requireMember(tx, userId, circleId);
      const existing = await tx.workSession.findUnique({
        where: { id: data.id },
        include,
      });
      if (existing) {
        if (
          existing.userId !== userId ||
          existing.circleId !== circleId ||
          existing.commitmentId !== data.taskId
        )
          throw new DomainError("This session belongs to another task.", 409);
        return toWorkSession(existing);
      }
      const active = await tx.workSession.findUnique({
        where: { runningUserId: userId },
        include,
      });
      if (active) {
        if (active.commitmentId === data.taskId && active.circleId === circleId)
          return toWorkSession(active);
        throw new DomainError(
          `Stop your current stopwatch before starting another task.`,
          409,
        );
      }
      const task = await tx.commitment.findFirst({
        where: { id: data.taskId, userId, circleId },
        include: {
          proofs: {
            where: { replacedById: null },
            orderBy: { submittedAt: "desc" },
            take: 1,
          },
        },
      });
      if (!task) throw new DomainError("Task not found.", 404);
      if (
        await tx.pendingProof.count({
          where: { commitmentId: task.id, dismissed: false, proofId: null },
        })
      )
        throw new DomainError("This task already has proof processing.", 409);
      if (
        !canTrackTask(
          {
            ...task,
            dueAt: task.dueAt.toISOString(),
            proofSubmittedAt: task.proofSubmittedAt?.toISOString(),
            proof: task.proofs[0] ?? null,
          },
          now.getTime(),
        )
      )
        throw new DomainError("This task is no longer open for work.", 409);
      return toWorkSession(
        await tx.workSession.create({
          data: {
            id: data.id,
            userId,
            circleId,
            commitmentId: data.taskId,
            runningUserId: userId,
            startedAt: now,
          },
          include,
        }),
      );
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const retry = await getPrisma().workSession.findFirst({
        where: { id: data.id, userId, circleId, commitmentId: data.taskId },
        include,
      });
      if (retry) return toWorkSession(retry);
      throw new DomainError(
        "A stopwatch was already started on another tab or device. Refresh and try again.",
        409,
      );
    }
    throw error;
  }
}

export async function stopWorkSession(
  userId: string,
  id: string,
  now = new Date(),
) {
  return serializable(async (tx) => {
    const session = await tx.workSession.findFirst({
      where: { id, userId },
      include,
    });
    if (!session) throw new DomainError("Session not found.", 404);
    await requireMember(tx, userId, session.circleId);
    // Retrying a lost Stop response must not extend the recorded time.
    if (session.endedAt) return toWorkSession(session);
    return toWorkSession(
      await tx.workSession.update({
        where: { id },
        data: {
          endedAt: new Date(
            Math.max(now.getTime(), session.startedAt.getTime() + 1),
          ),
          runningUserId: null,
        },
        include,
      }),
    );
  });
}

const editSchema = z.object({
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export async function editWorkSession(
  userId: string,
  id: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError("Enter valid start and finish times.");
  const startedAt = new Date(parsed.data.startedAt);
  const endedAt = new Date(parsed.data.endedAt);
  if (endedAt <= startedAt)
    throw new DomainError("The finish time must be after the start time.");
  if (endedAt > now)
    throw new DomainError("Recorded work cannot be in the future.");
  return serializable(async (tx) => {
    const session = await tx.workSession.findFirst({
      where: { id, userId },
      include,
    });
    if (!session) throw new DomainError("Session not found.", 404);
    await requireMember(tx, userId, session.circleId);
    if (!session.endedAt)
      throw new DomainError(
        "Stop the stopwatch before adjusting its times.",
        409,
      );
    if (session.updatedAt.toISOString() !== parsed.data.updatedAt)
      throw new DomainError(
        "This session changed on another device. Reopen it before editing.",
        409,
      );
    const overlap = await tx.workSession.findFirst({
      where: {
        userId,
        id: { not: id },
        startedAt: { lt: endedAt },
        OR: [{ endedAt: null }, { endedAt: { gt: startedAt } }],
      },
      select: { id: true },
    });
    if (overlap)
      throw new DomainError(
        "This overlaps another recorded work session.",
        409,
      );
    return toWorkSession(
      await tx.workSession.update({
        where: { id },
        data: {
          startedAt,
          endedAt,
          updatedAt: new Date(
            Math.max(Date.now(), session.updatedAt.getTime() + 1),
          ),
        },
        include,
      }),
    );
  });
}

// Cancellation or leaving a circle closes an active interval without erasing
// the work already done. Account/circle deletion follows the existing cascade.
export async function closeWorkSessions(
  tx: Prisma.TransactionClient,
  where: Prisma.WorkSessionWhereInput,
  now = new Date(),
) {
  const sessions = await tx.workSession.findMany({
    where: { ...where, endedAt: null },
  });
  for (const session of sessions)
    await tx.workSession.update({
      where: { id: session.id },
      data: {
        endedAt: new Date(
          Math.max(now.getTime(), session.startedAt.getTime() + 1),
        ),
        runningUserId: null,
      },
    });
}

export async function resolveWorkSessionTimes(
  tx: Prisma.TransactionClient,
  taskId: string,
  fallback: { startedAt: Date; completedAt: Date },
) {
  const sessions = await tx.workSession.findMany({
    where: { commitmentId: taskId },
    orderBy: { startedAt: "asc" },
  });
  if (!sessions.length) return { ...fallback, tracked: false };
  if (sessions.some((session) => !session.endedAt))
    throw new DomainError("Stop your stopwatch before posting proof.", 409);
  return {
    startedAt: sessions[0].startedAt,
    completedAt: new Date(
      Math.max(
        ...sessions.map((session) => (session.endedAt as Date).getTime()),
      ),
    ),
    tracked: true,
  };
}
