import { afterAll, beforeAll, expect, mock, test } from "bun:test";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error("Use bun run test:social. Disposable Postgres is required.");
mock.module("server-only", () => ({}));
const { getPrisma } = await import("@/lib/prisma");
const { createGoal, changeGoal, getGoal, getGoals } = await import(
  "@/lib/goals"
);
const { createCommitment } = await import("@/lib/tasks");
const prisma = getPrisma();
const circleId = "goals-circle";
const userId = "goals-owner";
const peerId = "goals-peer";
const otherId = "goals-other";
const now = new Date("2026-10-02T20:00:00Z");
const posted = new Date("2026-09-23T19:00:00Z");
const goalInput = (title = "Make a film") => ({
  circleId,
  title,
  milestones: ["Finish the script", "Shoot the film"],
});

beforeAll(async () => {
  await prisma.user.createMany({
    data: [userId, peerId, otherId].map((id) => ({
      id,
      name: id,
      email: `${id}@example.invalid`,
    })),
  });
  await prisma.circle.createMany({
    data: [circleId, otherId].map((id) => ({
      id,
      name: id,
      slug: id,
      createdAt: new Date("2026-09-01T20:00:00Z"),
    })),
  });
  await prisma.membership.createMany({
    data: [
      { userId, circleId, role: "OWNER" },
      { userId: peerId, circleId },
      { userId: otherId, circleId: otherId },
      { userId, circleId: otherId },
    ],
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});

test("goal visibility and mutations enforce membership and ownership", async () => {
  const goal = await createGoal(userId, circleId, goalInput());
  expect(
    (await getGoals(circleId, peerId)).some((item) => item.id === goal.id),
  ).toBe(true);
  await expect(getGoal(circleId, goal.id, otherId)).rejects.toThrow();
  expect(await getGoal(otherId, goal.id, userId)).toBeNull();
  await expect(
    changeGoal(goal.id, peerId, circleId, {
      action: "status",
      status: "COMPLETED",
    }),
  ).rejects.toThrow("Only the person");
  await expect(createGoal(userId, otherId, goalInput())).rejects.toThrow(
    "circle changed",
  );
  await expect(createGoal(otherId, circleId, goalInput())).rejects.toThrow(
    "no longer",
  );
});

test("milestone timestamps are idempotent and completion requires finished steps", async () => {
  const goal = await createGoal(userId, circleId, goalInput("Write a story"));
  const detail = await getGoal(circleId, goal.id, userId);
  if (!detail) throw new Error("Missing goal");
  await expect(
    changeGoal(goal.id, userId, circleId, {
      action: "status",
      status: "COMPLETED",
    }),
  ).rejects.toThrow("Finish your milestones");
  const milestoneId = detail.milestones[0].id;
  await changeGoal(
    goal.id,
    userId,
    circleId,
    { action: "milestone", milestoneId, completed: true },
    posted,
  );
  await changeGoal(
    goal.id,
    userId,
    circleId,
    { action: "milestone", milestoneId, completed: true },
    now,
  );
  expect(
    (
      await prisma.goalMilestone.findUniqueOrThrow({
        where: { id: milestoneId },
      })
    ).completedAt?.toISOString(),
  ).toBe(posted.toISOString());
  await changeGoal(
    goal.id,
    userId,
    circleId,
    {
      action: "milestone",
      milestoneId: detail.milestones[1].id,
      completed: true,
    },
    posted,
  );
  await changeGoal(
    goal.id,
    userId,
    circleId,
    { action: "status", status: "COMPLETED" },
    posted,
  );
  await expect(
    changeGoal(goal.id, userId, circleId, {
      action: "addMilestone",
      title: "Later",
    }),
  ).rejects.toThrow("Reopen");
  await changeGoal(goal.id, userId, circleId, {
    action: "status",
    status: "ACTIVE",
  });
  await changeGoal(goal.id, userId, circleId, {
    action: "milestone",
    milestoneId,
    completed: false,
  });
  expect(
    (
      await prisma.goalMilestone.findUniqueOrThrow({
        where: { id: milestoneId },
      })
    ).completedAt,
  ).toBeNull();
});

test("concurrent milestone edits obey the limit", async () => {
  const goal = await createGoal(userId, circleId, {
    ...goalInput(),
    milestones: Array.from({ length: 19 }, (_, index) => `Step ${index}`),
  });
  const results = await Promise.allSettled(
    ["One", "Two"].map((title) =>
      changeGoal(goal.id, userId, circleId, { action: "addMilestone", title }),
    ),
  );
  expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(await prisma.goalMilestone.count({ where: { goalId: goal.id } })).toBe(
    20,
  );
});

test("task links cannot cross people or circles, steal links, or reset deadlines", async () => {
  const goal = await createGoal(userId, circleId, goalInput());
  const otherGoal = await createGoal(
    userId,
    circleId,
    goalInput("Another project"),
  );
  const task = await createCommitment(
    userId,
    circleId,
    { title: "Write a scene", goalId: goal.id },
    posted,
  );
  expect(task.goalId).toBe(goal.id);
  await expect(
    createCommitment(peerId, circleId, { title: "Stolen", goalId: goal.id }),
  ).rejects.toThrow("active goals");
  await expect(
    createCommitment(userId, otherId, {
      title: "Wrong circle",
      goalId: goal.id,
    }),
  ).rejects.toThrow("active goals");
  await expect(
    changeGoal(otherGoal.id, userId, circleId, {
      action: "linkTask",
      taskId: task.id,
    }),
  ).rejects.toThrow("another goal");
  await changeGoal(goal.id, userId, circleId, {
    action: "unlinkTask",
    taskId: task.id,
  });
  await changeGoal(otherGoal.id, userId, circleId, {
    action: "linkTask",
    taskId: task.id,
  });
  const linked = await prisma.commitment.findUniqueOrThrow({
    where: { id: task.id },
  });
  expect(linked.dueAt).toEqual(task.dueAt);
  expect(linked.title).toEqual(task.title);
  expect((await getGoal(circleId, otherGoal.id, userId))?.tasks[0]?.id).toBe(
    task.id,
  );
});
