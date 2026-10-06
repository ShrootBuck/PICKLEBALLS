import { getPrisma } from "@/lib/prisma";
import { latestScreenTimeWeek } from "@/lib/screen-time";
import { phoenixWallToDate, requireDateKey } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error("Fixtures require the disposable runner.");
const prisma = getPrisma();
const week = latestScreenTimeWeek();
const posted = phoenixWallToDate(shiftDateKey(week, 3), 16, 0, 0, 0) as Date;
await prisma.circle.update({
  where: { id: "demo-circle" },
  data: { createdAt: new Date("2026-08-20T18:00:00Z") },
});
await prisma.goal.create({
  data: {
    id: "demo-goal-codeforces",
    userId: "demo-you",
    circleId: "demo-circle",
    title: "Reach 1600 on Codeforces",
    description:
      "Build the problem-solving habits to handle tougher contests. One good practice session at a time.",
    targetDate: new Date("2026-12-31"),
    createdAt: new Date("2026-09-01T18:00:00Z"),
    milestones: {
      create: [
        {
          title: "Finish a week of deliberate practice",
          position: 0,
          completedAt: posted,
        },
        { title: "Solve ten problems rated 1500", position: 1 },
        { title: "Reach 1600 in a rated contest", position: 2 },
      ],
    },
  },
});
await prisma.goal.create({
  data: {
    id: "demo-goal-film",
    userId: "demo-eddie",
    circleId: "demo-circle",
    title: "Make my first short film",
    description: "A story we actually finish and show to our friends.",
    targetDate: new Date("2026-11-20"),
    milestones: {
      create: [
        { title: "Finish the script", position: 0, completedAt: posted },
        { title: "Shoot the film", position: 1 },
        { title: "Lock the final edit", position: 2 },
      ],
    },
  },
});
const bytes = Buffer.from(
  await Bun.file("/private/tmp/pb-proof-fixture.png").arrayBuffer(),
);
for (const [index, userId, title] of [
  [0, "demo-you", "Solve three dynamic programming problems"],
  [1, "demo-eddie", "Finish the first draft of the script"],
  [2, "demo-sam", "Finish the physics problem set"],
] as const) {
  const task = await prisma.commitment.create({
    data: {
      id: `demo-goal-task-${index}`,
      circleId: "demo-circle",
      userId,
      title,
      day: requireDateKey(shiftDateKey(week, 3)),
      dueAt: new Date(posted.getTime() + 86_400_000),
      createdAt: new Date(posted.getTime() - 3_600_000),
      status: "VERIFIED",
      goalId:
        index === 0
          ? "demo-goal-codeforces"
          : index === 1
            ? "demo-goal-film"
            : null,
    },
  });
  await prisma.taskProof.create({
    data: {
      id: `demo-goal-proof-${index}`,
      commitmentId: task.id,
      circleId: "demo-circle",
      ownerId: userId,
      submittedAt: posted,
      startedAt: new Date(posted.getTime() - 3_600_000),
      completedAt: posted,
      isLate: false,
      reviewStatus: "APPROVED",
      image: {
        create: {
          data: bytes,
          mimeType: "image/png",
          sizeBytes: bytes.length,
          width: 900,
          height: 1125,
        },
      },
    },
  });
}
await prisma.commitment.update({
  where: { id: "demo-task-2" },
  data: { goalId: "demo-goal-codeforces" },
});
await prisma.$disconnect();
console.log("Seeded goals with linked, verified tasks.");
