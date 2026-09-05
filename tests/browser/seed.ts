import { createHash, createHmac } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { PrismaClient } from "../../generated/prisma/client";
import {
  phoenixDateKey,
  phoenixDayDueAt,
  requireDateKey,
} from "../../lib/time";
import { shiftDateKey } from "../../lib/timeblocks";

export const testSecret =
  "pickleballs-browser-tests-only-9e198f6b29ecf8ea5aaab1f3";
export const fixtureToken = "audit-invite-token-for-temporary-fixtures-only";
export const circleId = "audit-circle";
export const otherCircleId = "audit-other-circle";

export function testPrisma() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.PB_TEST_DATABASE !== "disposable-docker" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/pickleballs_audit_test" ||
    ["51218", "51219", "51221", "51222", "5432"].includes(url.port)
  ) {
    throw new Error(
      "Browser fixtures require the disposable Docker database created by test:browser.",
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }),
  });
}

export function sessionCookie(userId = "alex") {
  const token = `audit-session-${userId}`;
  return encodeURIComponent(
    `${token}.${createHmac("sha256", testSecret).update(token).digest("base64")}`,
  );
}

export async function seedBrowserData() {
  const db = testPrisma();
  try {
    if (await db.user.count())
      throw new Error("Refusing to seed a database that already has users.");
    const dayKey = phoenixDateKey();
    const yesterday = shiftDateKey(dayKey, -1);
    await db.circle.createMany({
      data: [
        { id: circleId, slug: "audit-friends", name: "The study crew" },
        { id: otherCircleId, slug: "audit-other", name: "The study crew" },
      ],
    });
    for (const [id, name] of [
      ["alex", "Alex Rivera"],
      ["sam", "Sam Chen"],
      ["jules", "Jules Park"],
      ["robin", "Robin Lee"],
      ["outsider", "Other Circle Member"],
      ["newcomer", "New Friend"],
    ]) {
      await db.user.create({
        data: {
          id,
          name,
          email: `${id}@audit.invalid`,
          initials: name
            .split(" ")
            .map((x) => x[0])
            .slice(0, 2)
            .join(""),
          sessions: {
            create: {
              id: `session-${id}`,
              token: `audit-session-${id}`,
              expiresAt: new Date(Date.now() + 86_400_000),
            },
          },
        },
      });
      if (id !== "newcomer")
        await db.membership.create({
          data: {
            userId: id,
            circleId: id === "outsider" ? otherCircleId : circleId,
            role: id === "alex" || id === "outsider" ? "OWNER" : "MEMBER",
          },
        });
    }
    await db.membership.create({
      data: { userId: "alex", circleId: otherCircleId, role: "OWNER" },
    });
    const image = await sharp(
      Buffer.from(
        '<svg width="900" height="650"><rect width="900" height="650" fill="white"/><text x="50" y="75" font-size="32">Calculus practice - all 18 problems</text><text x="50" y="140" font-size="24">1. Integral of x squared = x cubed / 3 + C</text><text x="50" y="220" font-size="24">Answers checked. Fake photo for browser tests.</text></svg>',
      ),
    )
      .webp()
      .toBuffer();
    for (const [id, userId, title, dateKey, status] of [
      [
        "open-task",
        "alex",
        "Finish the physics problem set and check every answer",
        dayKey,
        "OPEN",
      ],
      [
        "old-task",
        "alex",
        "Yesterday's unfinished reading",
        yesterday,
        "MISSED",
      ],
      [
        "pending-task",
        "sam",
        "Finish calculus practice",
        dayKey,
        "AWAITING_REVIEW",
      ],
      ["approved-task", "alex", "Read chapter 4", dayKey, "VERIFIED"],
      [
        "old-proof-task",
        "sam",
        "Last week's practice exam",
        yesterday,
        "VERIFIED",
      ],
      [
        "other-task",
        "outsider",
        "Private task in the other circle",
        dayKey,
        "OPEN",
      ],
    ] as const) {
      await db.commitment.create({
        data: {
          id,
          userId,
          circleId: id === "other-task" ? otherCircleId : circleId,
          day: requireDateKey(dateKey),
          dueAt: phoenixDayDueAt(dateKey) ?? new Date(),
          title,
          definitionOfDone:
            "Show all completed pages, including worked solutions and checked answers. Include the final page with the last problem.",
          status,
        },
      });
      if (status === "AWAITING_REVIEW" || status === "VERIFIED") {
        const proofId = `${id}-proof`;
        await db.taskProof.create({
          data: {
            id: proofId,
            commitmentId: id,
            ownerId: userId,
            circleId,
            startedAt: new Date(Date.now() - 3_600_000),
            completedAt: new Date(Date.now() - 1_800_000),
            isLate: false,
            aiStatus: "FAILED",
            reviewStatus: status === "VERIFIED" ? "APPROVED" : "PENDING",
            ownerNote: "All pages are visible. Check the last answer.",
            image: {
              create: {
                data: image,
                mimeType: "image/webp",
                sizeBytes: image.length,
                width: 900,
                height: 650,
              },
            },
            ...(status === "VERIFIED"
              ? {
                  reviews: {
                    create: {
                      reviewerId: "jules",
                      circleId,
                      decision: "APPROVED",
                      note: "Looks good.",
                    },
                  },
                }
              : {}),
          },
        });
      }
    }
    const checkIn = await db.checkIn.create({
      data: {
        id: "sam-checkin",
        userId: "sam",
        circleId,
        day: requireDateKey(dayKey),
        signal: "NAY",
        blocker: "Stuck on the last integral. Anyone around?",
      },
    });
    await db.checkInUpdate.create({
      data: {
        userId: "sam",
        circleId,
        day: requireDateKey(dayKey),
        checkInId: checkIn.id,
        signal: "NAY",
        blocker: checkIn.blocker,
      },
    });
    await db.socialReply.create({
      data: {
        id: "sam-reply",
        authorId: "sam",
        circleId,
        commitmentId: "open-task",
        body: "Let's compare answers after dinner.",
      },
    });
    await db.notification.create({
      data: {
        id: "audit-notification",
        recipientId: "alex",
        actorId: "sam",
        circleId,
        kind: "REPLY_POSTED",
        entityId: "open-task",
        title: "Sam replied to your task",
        body: "Let's compare answers after dinner.",
        data: { url: "/squad?focus=open-task" },
      },
    });
    await db.invite.create({
      data: {
        id: "audit-invite",
        circleId,
        createdById: "alex",
        label: "A new friend",
        tokenHash: createHash("sha256").update(fixtureToken).digest("hex"),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  } finally {
    await db.$disconnect();
  }
}
