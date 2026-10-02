import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import {
  bucketItemHref,
  memberHref,
  postHref,
  squadHref,
} from "@/lib/navigation";
import { getPrisma } from "@/lib/prisma";
import { socialAuthorSelect } from "@/lib/social-data";
import { requireDateKey } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";
import { serializable } from "@/lib/transaction";
import {
  firstWrappedWeek,
  screenTimeImprovement,
  wrappedWeek,
} from "@/lib/wrapped-policy";

export async function getWrapped(
  circleId: string,
  viewerId: string,
  requested?: string,
  now = new Date(),
) {
  const week = wrappedWeek(requested, now);
  const prisma = getPrisma();
  const membership = await prisma.membership.findUnique({
    where: { userId_circleId: { userId: viewerId, circleId } },
    include: { circle: true },
  });
  if (!membership) throw new DomainError("Circle not found.", 404);
  const first = firstWrappedWeek(membership.circle.createdAt);
  if (requested && week.startKey < first)
    throw new DomainError(
      "This circle hadn't started yet. Choose a newer week.",
      404,
    );
  const dates = { gte: week.startAt, lt: week.endAt };
  const proofWhere = {
    circleId,
    submittedAt: dates,
    replacedById: null,
    reviewStatus: "APPROVED" as const,
    commitment: { status: "VERIFIED" as const },
  };
  const [
    members,
    verified,
    checkIns,
    reviews,
    proofs,
    milestones,
    finishedGoals,
    buckets,
    readings,
    wins,
    topReplies,
  ] = await Promise.all([
    prisma.membership.findMany({
      where: { circleId },
      orderBy: { createdAt: "asc" },
      select: { user: { select: socialAuthorSelect } },
    }),
    prisma.taskProof.groupBy({
      by: ["ownerId"],
      where: proofWhere,
      _count: { _all: true },
    }),
    prisma.checkInUpdate.count({ where: { circleId, createdAt: dates } }),
    prisma.taskProofReview.count({ where: { circleId, createdAt: dates } }),
    prisma.taskProof.findMany({
      where: proofWhere,
      orderBy: [
        { likes: { _count: "desc" } },
        { submittedAt: "desc" },
        { id: "asc" },
      ],
      take: 12,
      include: {
        owner: { select: socialAuthorSelect },
        commitment: {
          select: { title: true, goal: { select: { id: true, title: true } } },
        },
        image: { select: { proofId: true } },
        _count: { select: { likes: true } },
      },
    }),
    prisma.goalMilestone.findMany({
      where: { completedAt: dates, goal: { circleId } },
      orderBy: [{ completedAt: "desc" }, { id: "asc" }],
      include: {
        goal: {
          select: {
            id: true,
            title: true,
            user: { select: socialAuthorSelect },
          },
        },
      },
    }),
    prisma.goal.findMany({
      where: { circleId, status: "COMPLETED", completedAt: dates },
      orderBy: { completedAt: "desc" },
      select: { id: true, title: true, user: { select: socialAuthorSelect } },
    }),
    prisma.bucketItem.findMany({
      where: { circleId, status: "COMPLETED", completedAt: dates },
      select: { id: true, title: true },
    }),
    prisma.screenTimeSubmission.findMany({
      where: {
        circleId,
        weekStart: {
          in: [
            requireDateKey(week.startKey),
            requireDateKey(shiftDateKey(week.startKey, -7)),
          ],
        },
      },
      select: {
        userId: true,
        weekStart: true,
        reading: { select: { dailyAverageMinutes: true } },
        user: { select: socialAuthorSelect },
      },
    }),
    prisma.weeklyWin.findMany({
      where: { circleId, weekStart: requireDateKey(week.startKey) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { user: { select: socialAuthorSelect } },
    }),
    prisma.socialReply.findMany({
      where: {
        circleId,
        createdAt: dates,
        body: { not: "" },
        likes: { some: {} },
        OR: [
          { proof: { replacedById: null } },
          { checkInUpdateId: { not: null } },
          { bucketItemId: { not: null } },
          { commitmentId: { not: null } },
          { review: { proof: { replacedById: null } } },
          { checkInId: { not: null } },
        ],
      },
      orderBy: [
        { likes: { _count: "desc" } },
        { createdAt: "asc" },
        { id: "asc" },
      ],
      take: 1,
      include: {
        author: { select: socialAuthorSelect },
        _count: { select: { likes: true } },
        commitment: { select: { userId: true, day: true } },
        review: { select: { proofId: true } },
      },
    }),
  ]);
  const counts = new Map(verified.map((row) => [row.ownerId, row._count._all]));
  const current = readings.filter(
    (row) => row.weekStart.toISOString().slice(0, 10) === week.startKey,
  );
  const previous = new Map(
    readings
      .filter(
        (row) => row.weekStart.toISOString().slice(0, 10) !== week.startKey,
      )
      .map((row) => [row.userId, row.reading.dailyAverageMinutes]),
  );
  const improvements = current
    .flatMap((row) => {
      const change = screenTimeImprovement(
        row.reading.dailyAverageMinutes,
        previous.get(row.userId) ?? null,
      );
      return change
        ? [
            {
              ...change,
              user: row.user,
              current: row.reading.dailyAverageMinutes,
              previous: previous.get(row.userId) as number,
            },
          ]
        : [];
    })
    .sort(
      (a, b) => b.minutes - a.minutes || a.user.name.localeCompare(b.user.name),
    );
  const mostImproved = improvements.filter(
    (item) => item.minutes === improvements[0]?.minutes,
  );
  const reply = topReplies[0];
  const replyHref = reply
    ? reply.proofId
      ? postHref(circleId, "proof", reply.proofId)
      : reply.checkInUpdateId
        ? postHref(circleId, "check-in", reply.checkInUpdateId)
        : reply.bucketItemId
          ? bucketItemHref(circleId, reply.bucketItemId)
          : reply.commitment
            ? memberHref(
                circleId,
                reply.commitment.userId,
                "tasks",
                reply.commitment.day.toISOString().slice(0, 10),
              )
            : reply.review
              ? postHref(circleId, "proof", reply.review.proofId)
              : reply.checkInId
                ? squadHref(circleId, reply.checkInId)
                : null
    : null;
  return {
    circleId,
    circleName: membership.circle.name,
    week,
    first,
    totalVerified: verified.reduce((sum, row) => sum + row._count._all, 0),
    checkIns,
    reviews,
    milestones,
    finishedGoals,
    buckets,
    proofs,
    wins,
    participants: verified.length,
    members: members.map(({ user }) => ({
      ...user,
      verified: counts.get(user.id) ?? 0,
    })),
    mostImproved,
    screenTimeCount: current.length,
    topReply:
      reply && replyHref
        ? {
            id: reply.id,
            author: reply.author,
            body: reply.body,
            likes: reply._count.likes,
            href: `${replyHref}#comments`,
          }
        : null,
  };
}

const winSchema = z.object({
  circleId: z.string().min(1).max(100),
  week: z.string(),
  body: z.string().trim().max(280),
});
export async function saveWeeklyWin(
  userId: string,
  circleId: string,
  input: unknown,
  now = new Date(),
) {
  const parsed = winSchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError("Keep your win to 280 characters.");
  if (parsed.data.circleId !== circleId)
    throw new DomainError("Your circle changed. Refresh and try again.", 409);
  const week = wrappedWeek(parsed.data.week, now);
  return serializable(async (tx) => {
    const member = await tx.membership.findUnique({
      where: { userId_circleId: { userId, circleId } },
      include: { circle: true },
    });
    if (!member)
      throw new DomainError("You are no longer in this circle.", 403);
    if (week.startKey < firstWrappedWeek(member.circle.createdAt))
      throw new DomainError("Choose a week after your circle started.");
    const where = {
      userId,
      circleId,
      weekStart: requireDateKey(week.startKey),
    };
    if (!parsed.data.body) {
      await tx.weeklyWin.deleteMany({ where });
      return null;
    }
    return tx.weeklyWin.upsert({
      where: { userId_circleId_weekStart: where },
      create: { ...where, body: parsed.data.body },
      update: { body: parsed.data.body },
    });
  });
}
