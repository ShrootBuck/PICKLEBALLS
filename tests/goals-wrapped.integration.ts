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
const { getWrapped, saveWeeklyWin } = await import("@/lib/wrapped");
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

test("recap counts only verified, current proof posted inside the Phoenix week", async () => {
  const goal = await createGoal(
    userId,
    circleId,
    goalInput("Wrapped evidence"),
  );
  for (const [id, date, status] of [
    ["gw-before", new Date("2026-09-20T06:59:59Z"), "APPROVED"],
    ["gw-start", new Date("2026-09-20T07:00:00Z"), "APPROVED"],
    ["gw-last", new Date("2026-09-27T06:59:59Z"), "APPROVED"],
    ["gw-end", new Date("2026-09-27T07:00:00Z"), "APPROVED"],
    ["gw-pending", posted, "PENDING"],
    ["gw-replaced", posted, "APPROVED"],
  ] as const) {
    const task = await createCommitment(
      userId,
      circleId,
      { title: id, goalId: goal.id },
      date,
    );
    await prisma.commitment.update({
      where: { id: task.id },
      data: { status: status === "APPROVED" ? "VERIFIED" : "AWAITING_REVIEW" },
    });
    await prisma.taskProof.create({
      data: {
        id,
        commitmentId: task.id,
        ownerId: userId,
        circleId,
        submittedAt: date,
        startedAt: date,
        completedAt: date,
        isLate: false,
        reviewStatus: status,
      },
    });
  }
  await prisma.taskProof.update({
    where: { id: "gw-replaced" },
    data: { replacedById: "gw-start" },
  });
  const recap = await getWrapped(circleId, userId, "2026-09-20", now);
  expect(recap.totalVerified).toBe(2);
  expect(recap.proofs.map((item) => item.id).sort()).toEqual([
    "gw-last",
    "gw-start",
  ]);
  expect(recap.mostImproved).toHaveLength(0);
  await expect(
    getWrapped(circleId, otherId, "2026-09-20", now),
  ).rejects.toThrow("Circle not found");
  expect(
    (await getWrapped(otherId, otherId, "2026-09-20", now)).totalVerified,
  ).toBe(0);
});

test("recap handles tied screen-time improvements and missing baselines", async () => {
  for (const [who, week, minutes] of [
    [userId, "2026-09-13", 120],
    [userId, "2026-09-20", 90],
    [peerId, "2026-09-13", 60],
    [peerId, "2026-09-20", 30],
  ] as const) {
    const reading = await prisma.screenTimeReading.create({
      data: {
        userId: who,
        circleId,
        weekStart: new Date(week),
        dailyAverageMinutes: minutes,
        mediaId: `gw-screen-${who}-${week}`,
      },
    });
    await prisma.screenTimeSubmission.create({
      data: {
        userId: who,
        circleId,
        weekStart: new Date(week),
        readingId: reading.id,
      },
    });
  }
  const recap = await getWrapped(circleId, userId, "2026-09-20", now);
  expect(recap.mostImproved).toHaveLength(2);
  expect(recap.mostImproved.map((item) => item.minutes)).toEqual([30, 30]);
});

test("weekly wins are per person, editable, removable, and scoped to completed weeks", async () => {
  await saveWeeklyWin(
    userId,
    circleId,
    { circleId, week: "2026-09-20", body: "  Finally finished.  " },
    now,
  );
  await saveWeeklyWin(
    userId,
    circleId,
    { circleId, week: "2026-09-20", body: "Finished and shared it." },
    now,
  );
  await saveWeeklyWin(
    peerId,
    circleId,
    { circleId, week: "2026-09-20", body: "I helped." },
    now,
  );
  let recap = await getWrapped(circleId, userId, "2026-09-20", now);
  expect(recap.wins).toHaveLength(2);
  expect(recap.wins.find((win) => win.userId === userId)?.body).toBe(
    "Finished and shared it.",
  );
  await expect(
    saveWeeklyWin(
      otherId,
      circleId,
      { circleId, week: "2026-09-20", body: "No" },
      now,
    ),
  ).rejects.toThrow("no longer");
  await expect(
    saveWeeklyWin(
      userId,
      circleId,
      { circleId, week: "2026-09-27", body: "Future" },
      now,
    ),
  ).rejects.toThrow("completed");
  await saveWeeklyWin(
    userId,
    circleId,
    { circleId, week: "2026-09-20", body: "" },
    now,
  );
  recap = await getWrapped(circleId, userId, "2026-09-20", now);
  expect(recap.wins).toHaveLength(1);
});
