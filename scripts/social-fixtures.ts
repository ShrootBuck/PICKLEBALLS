import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getPrisma } from "@/lib/prisma";
import { latestScreenTimeWeek } from "@/lib/screen-time";
import { phoenixDateKey, phoenixDayDueAt, requireDateKey } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error("Fixtures require the disposable runner.");
const prisma = getPrisma();
const now = new Date();
const dayKey = phoenixDateKey(now);
const day = requireDateKey(dayKey);
const dueAt = phoenixDayDueAt(dayKey);
if (!dueAt) throw new Error("Invalid fixture day.");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const proofImage = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1125"><rect width="900" height="1125" fill="#e8e4d8"/><rect x="75" y="65" width="750" height="985" rx="6" fill="#fffdf6"/><g fill="#2e3e55" font-family="sans-serif"><text x="125" y="155" font-size="22">PHYSICS / CHAPTER 4</text><text x="125" y="230" font-size="40">Work, energy, and a</text><text x="125" y="282" font-size="40">well-earned break.</text><text x="125" y="410" font-size="28">1. W = F · d · cos(θ)</text><text x="125" y="475" font-size="24">   = 12 × 4 × cos(0)</text><text x="125" y="535" font-size="24">   = 48 J</text><text x="125" y="675" font-size="28">2. KE = ½ mv²</text><text x="125" y="735" font-size="24">    = ½ × 2 × 6²</text><text x="125" y="795" font-size="24">    = 36 J</text><text x="125" y="960" font-size="20">LOCAL TEST FIXTURE</text></g><path d="M635 505l25 28 55-65M635 770l25 28 55-65" fill="none" stroke="#458a65" stroke-width="8"/></svg>`,
  ),
)
  .png()
  .toBuffer();
await Bun.write("/private/tmp/pb-proof-fixture.png", proofImage);
await prisma.circle.createMany({
  data: [
    { id: "demo-circle", slug: "after-school", name: "After school" },
    { id: "demo-other", slug: "weekend-project", name: "Weekend project" },
  ],
});
for (const [id, name, initials] of [
  ["demo-you", "Zayd Krunz", "ZK"],
  ["demo-eddie", "Eddie", "ED"],
  ["demo-sam", "Sam", "SA"],
  ["demo-jules", "Jules", "JU"],
]) {
  await prisma.user.create({
    data: {
      id,
      name,
      initials,
      email: `${id}@example.invalid`,
      primaryColor: "mint",
    },
  });
  await prisma.membership.create({
    data: {
      userId: id,
      circleId: "demo-circle",
      role: id === "demo-you" ? "OWNER" : "MEMBER",
      createdAt: new Date("2026-08-20T18:00:00Z"),
    },
  });
  await prisma.session.create({
    data: {
      id: `session-${id}`,
      token: `fixture-session-${id}`,
      userId: id,
      expiresAt: new Date(now.getTime() + 86400_000),
    },
  });
}
await prisma.membership.create({
  data: { userId: "demo-you", circleId: "demo-other", role: "OWNER" },
});
for (const [index, owner, title, status] of [
  [0, "demo-eddie", "Finish the physics problem set", "PENDING"],
  [1, "demo-sam", "Read chapter 5 and write my notes", "APPROVED"],
  [2, "demo-you", "Practice integrals for 30 minutes", "APPROVED"],
  [3, "demo-you", "Finish the CS assignment", null],
  [4, "demo-you", "Review tomorrow’s physics material", null],
  [5, "demo-jules", "Make a start on the essay", "CHALLENGED"],
] as const) {
  const task = await prisma.commitment.create({
    data: {
      id: `demo-task-${index}`,
      circleId: "demo-circle",
      userId: owner,
      day,
      dueAt,
      title,
      definitionOfDone:
        "Complete all assigned questions and show the working clearly in the photos.",
      status:
        status === "APPROVED"
          ? "VERIFIED"
          : status === "PENDING"
            ? "AWAITING_REVIEW"
            : "OPEN",
    },
  });
  if (!status) continue;
  await prisma.taskProof.create({
    data: {
      id: `demo-proof-${index}`,
      ownerId: owner,
      circleId: "demo-circle",
      commitmentId: task.id,
      isLate: false,
      startedAt: ago(45 + index * 20),
      completedAt: ago(15 + index * 20),
      submittedAt: ago(10 + index * 20),
      ownerNote:
        index === 0
          ? "Finally got the last one. The units were the problem the whole time."
          : "Done for today. See you tomorrow.",
      reviewStatus: status,
      aiStatus: "SUCCEEDED",
      aiVisibleEvidence: "A page of calculations with worked solutions.",
      aiUncertainty: "The full assignment cannot be checked from one page.",
      aiTaskMatch: "The photo contains physics problems.",
      aiOneLiner: "The work is visible. Your circle makes the call.",
      image: {
        create: {
          data: proofImage,
          mimeType: "image/png",
          sizeBytes: proofImage.length,
          width: 900,
          height: 1125,
        },
      },
      ...(status !== "PENDING"
        ? {
            reviews: {
              create: {
                circleId: "demo-circle",
                reviewerId: owner === "demo-you" ? "demo-eddie" : "demo-you",
                decision: status,
                note:
                  status === "APPROVED"
                    ? "The work and answers are all there. Nice."
                    : "Add the last page so we can check it.",
              },
            },
          }
        : {}),
    },
  });
}
for (const [personIndex, userId] of [
  "demo-you",
  "demo-eddie",
  "demo-sam",
  "demo-jules",
].entries()) {
  const checkIn = await prisma.checkIn.create({
    data: {
      userId,
      circleId: "demo-circle",
      day,
      signal: personIndex === 3 ? "NAY" : "YAY",
      blocker:
        personIndex === 3
          ? "Essay is taking longer than I thought. Getting there."
          : "A little progress every day.",
    },
  });
  for (let index = 0; index < 6; index++)
    await prisma.checkInUpdate.create({
      data: {
        id: `demo-check-${personIndex}-${index}`,
        checkInId: checkIn.id,
        userId,
        circleId: "demo-circle",
        day,
        signal: personIndex === 3 ? "NAY" : "YAY",
        blocker: [
          "Small win: actually started before dinner.",
          "Study session done. Calling it a day.",
          "Need a second pair of eyes on the last problem.",
          "Phone away, timer on. Let’s do this.",
          "The first ten minutes are always the hardest.",
          "Back at it. Same goal, fresh page.",
        ][index],
        createdAt: ago(30 + personIndex * 10 + index * 90),
      },
    });
}
await prisma.socialReply.create({
  data: {
    authorId: "demo-sam",
    circleId: "demo-circle",
    checkInUpdateId: "demo-check-1-0",
    body: "Let’s compare answers after dinner.",
  },
});
await prisma.postLike.createMany({
  data: [
    { userId: "demo-sam", circleId: "demo-circle", proofId: "demo-proof-0" },
    {
      userId: "demo-you",
      circleId: "demo-circle",
      checkInUpdateId: "demo-check-1-0",
    },
  ],
});
for (const [i, userId] of ["demo-you", "demo-eddie", "demo-sam"].entries())
  for (const weeksAgo of [0, 1]) {
    const weekStart = requireDateKey(
      shiftDateKey(latestScreenTimeWeek(), -weeksAgo * 7),
    );
    const mediaId = `i_${randomUUID()}`;
    await prisma.mediaUpload.create({
      data: {
        id: mediaId,
        ownerId: userId,
        circleId: "demo-circle",
        mimeType: "image/png",
        sizeBytes: proofImage.length,
        objectKey: `fixture-screen-${i}-${weeksAgo}`,
        ready: true,
        claimed: true,
      },
    });
    const reading = await prisma.screenTimeReading.create({
      data: {
        userId,
        circleId: "demo-circle",
        weekStart,
        mediaId,
        dailyAverageMinutes: 115 + i * 26 + weeksAgo * 18,
      },
    });
    await prisma.screenTimeSubmission.create({
      data: {
        userId,
        circleId: "demo-circle",
        weekStart,
        readingId: reading.id,
      },
    });
  }
await prisma.$disconnect();
console.log(
  "Seeded four local members, 28 posts, tasks, verdicts, and two weeks of confirmed screen time.",
);
