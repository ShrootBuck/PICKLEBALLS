import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import {
  createGoalSchema,
  goalActionSchema,
  MAX_GOAL_MILESTONES,
} from "@/lib/goal-policy";
import { getPrisma } from "@/lib/prisma";
import {
  socialAuthorSelect,
  socialTaskInclude,
  toSocialTask,
} from "@/lib/social-data";
import { requireDateKey } from "@/lib/time";
import { serializable } from "@/lib/transaction";

async function requireMember(
  tx: Prisma.TransactionClient,
  userId: string,
  circleId: string,
) {
  if (
    !(await tx.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
    }))
  )
    throw new DomainError("You are no longer in this circle.", 403);
}

export async function createGoal(
  userId: string,
  circleId: string,
  input: unknown,
) {
  const parsed = createGoalSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(
      parsed.error.issues[0]?.message ?? "Check the goal fields.",
    );
  if (parsed.data.circleId !== circleId)
    throw new DomainError("Your circle changed. Refresh and try again.", 409);
  const { title, description, targetDate, milestones } = parsed.data;
  return serializable(async (tx) => {
    await requireMember(tx, userId, circleId);
    if (
      (await tx.goal.count({
        where: { userId, circleId, status: "ACTIVE" },
      })) >= 50
    )
      throw new DomainError(
        "You have 50 active goals. Complete or archive one before adding another.",
      );
    return tx.goal.create({
      data: {
        userId,
        circleId,
        title,
        description: description || null,
        targetDate: targetDate ? requireDateKey(targetDate) : null,
        milestones: {
          create: milestones.map((title, position) => ({ title, position })),
        },
      },
    });
  });
}

export async function changeGoal(
  goalId: string,
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = goalActionSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(
      parsed.error.issues[0]?.message ?? "Check the goal fields.",
    );
  const action = parsed.data;
  return serializable(async (tx) => {
    await requireMember(tx, userId, circleId);
    const goal = await tx.goal.findFirst({
      where: { id: goalId, circleId },
      include: { milestones: true },
    });
    if (!goal) throw new DomainError("Goal not found.", 404);
    if (goal.userId !== userId)
      throw new DomainError(
        "Only the person working on this goal can change it.",
        403,
      );
    if (action.action === "status") {
      if (action.status === goal.status) return goal;
      if (
        action.status === "COMPLETED" &&
        goal.milestones.some((item) => !item.completedAt)
      )
        throw new DomainError(
          "Finish your milestones before completing the goal.",
          409,
        );
      if (
        action.status === "ACTIVE" &&
        (await tx.goal.count({
          where: { userId, circleId, status: "ACTIVE" },
        })) >= 50
      )
        throw new DomainError(
          "Complete or archive an active goal before reopening this one.",
          409,
        );
      return tx.goal.update({
        where: { id: goalId },
        data: {
          status: action.status,
          completedAt: action.status === "COMPLETED" ? now : null,
        },
      });
    }
    if (goal.status !== "ACTIVE")
      throw new DomainError("Reopen this goal before changing it.", 409);
    if (action.action === "details") {
      return tx.goal.update({
        where: { id: goalId },
        data: {
          title: action.title,
          description: action.description || null,
          targetDate: action.targetDate
            ? requireDateKey(action.targetDate)
            : null,
        },
      });
    }
    if (action.action === "addMilestone") {
      if (goal.milestones.length >= MAX_GOAL_MILESTONES)
        throw new DomainError("A goal can have up to 20 milestones.");
      await tx.goalMilestone.create({
        data: {
          goalId,
          title: action.title,
          position:
            Math.max(-1, ...goal.milestones.map((item) => item.position)) + 1,
        },
      });
    } else if (
      action.action === "milestone" ||
      action.action === "removeMilestone"
    ) {
      const milestone = goal.milestones.find(
        (item) => item.id === action.milestoneId,
      );
      if (!milestone) throw new DomainError("Milestone not found.", 404);
      if (action.action === "removeMilestone")
        await tx.goalMilestone.delete({ where: { id: milestone.id } });
      else
        await tx.goalMilestone.update({
          where: { id: milestone.id },
          data: {
            completedAt: action.completed
              ? (milestone.completedAt ?? now)
              : null,
          },
        });
    } else {
      const task = await tx.commitment.findFirst({
        where: { id: action.taskId, userId, circleId },
      });
      if (!task) throw new DomainError("Task not found.", 404);
      if (action.action === "linkTask" && task.goalId && task.goalId !== goalId)
        throw new DomainError(
          "This task belongs to another goal. Unlink it there first.",
          409,
        );
      if (action.action === "unlinkTask" && task.goalId !== goalId)
        throw new DomainError("That task is not linked to this goal.", 409);
      await tx.commitment.update({
        where: { id: task.id },
        data: { goalId: action.action === "linkTask" ? goalId : null },
      });
    }
    return tx.goal.update({ where: { id: goalId }, data: { updatedAt: now } });
  });
}

export async function getGoals(circleId: string, viewerId: string) {
  const prisma = getPrisma();
  await requireMember(prisma, viewerId, circleId);
  return prisma.goal.findMany({
    where: { circleId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      user: { select: socialAuthorSelect },
      milestones: { select: { completedAt: true } },
      _count: { select: { tasks: { where: { status: "VERIFIED" } } } },
    },
  });
}

export async function getGoal(
  circleId: string,
  goalId: string,
  viewerId: string,
) {
  const prisma = getPrisma();
  await requireMember(prisma, viewerId, circleId);
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, circleId },
    include: {
      user: { select: socialAuthorSelect },
      milestones: { orderBy: [{ position: "asc" }, { id: "asc" }] },
      tasks: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: socialTaskInclude,
      },
    },
  });
  if (!goal) return null;
  const available =
    goal.userId === viewerId
      ? await prisma.commitment.findMany({
          where: { circleId, userId: viewerId, goalId: null },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
          select: { id: true, title: true, status: true },
        })
      : [];
  return { ...goal, tasks: goal.tasks.map(toSocialTask), available };
}
