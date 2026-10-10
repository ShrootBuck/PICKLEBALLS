import "server-only";
import { DomainError } from "@/lib/errors";
import {
  compareFeedPosts,
  encodeFeedCursor,
  type FeedCursor,
  feedBoundary,
  parseFeedCursor,
} from "@/lib/feed-cursor";
import { getPrisma } from "@/lib/prisma";
import type {
  FeedPage,
  FeedPost,
  SocialMember,
  SocialTask,
} from "@/lib/social-types";
import {
  currentTaskFilter,
  proofApprovalProgress,
  reviewableCommitmentFilter,
  shouldMarkMissed,
} from "@/lib/task-policy";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export const socialAuthorSelect = {
  id: true,
  name: true,
  image: true,
  initials: true,
} as const;
export const socialTaskInclude = {
  goal: { select: { id: true, title: true } },
  proofs: {
    where: { replacedById: null },
    orderBy: { submittedAt: "desc" },
    take: 1,
    select: { id: true, reviewStatus: true },
  },
} as const;

// Work-in-progress timing belongs to the account owner. Peer profile and
// circle queries use socialTaskInclude and never serialize these intervals.
export const ownTaskInclude = {
  ...socialTaskInclude,
  workSessions: {
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      circleId: true,
      startedAt: true,
      endedAt: true,
      updatedAt: true,
    },
  },
} as const;

export async function assertCircleMember(userId: string, circleId: string) {
  const member = await getPrisma().membership.findUnique({
    where: { userId_circleId: { userId, circleId } },
    select: { userId: true },
  });
  if (!member) throw new DomainError("Member not found.", 404);
}

export function toSocialTask(task: {
  id: string;
  title: string;
  day: Date;
  dueAt: Date;
  proofSubmittedAt?: Date | null;
  status: SocialTask["status"];
  proofs: NonNullable<SocialTask["proof"]>[];
  goal?: SocialTask["goal"];
  workSessions?: {
    id: string;
    circleId: string;
    startedAt: Date;
    endedAt: Date | null;
    updatedAt: Date;
  }[];
}): SocialTask {
  return {
    id: task.id,
    title: task.title,
    day: task.day.toISOString().slice(0, 10),
    dueAt: task.dueAt.toISOString(),
    proofSubmittedAt: task.proofSubmittedAt?.toISOString() ?? null,
    status: shouldMarkMissed(
      task.status,
      task.dueAt,
      new Date(),
      task.proofSubmittedAt,
    )
      ? "MISSED"
      : task.status,
    proof: task.proofs[0] ?? null,
    goal: task.goal ?? null,
    workSessions: task.workSessions?.map((session) => ({
      id: session.id,
      taskId: task.id,
      circleId: session.circleId,
      title: task.title,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      updatedAt: session.updatedAt.toISOString(),
    })),
  };
}

export async function getSocialMembers(
  circleId: string,
  dayKey = phoenixDateKey(),
): Promise<SocialMember[]> {
  const day = requireDateKey(dayKey);
  const rows = await getPrisma().membership.findMany({
    where: { circleId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          ...socialAuthorSelect,
          commitments: {
            where: {
              circleId,
              ...(dayKey === phoenixDateKey() ? currentTaskFilter() : { day }),
            },
            orderBy: { createdAt: "asc" },
            include: socialTaskInclude,
          },
          checkIns: {
            where: { circleId, day },
            take: 1,
            select: {
              signal: true,
              blocker: true,
              updates: {
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 1,
                select: { valence: true, journal: true },
              },
            },
          },
        },
      },
    },
  });
  return rows.map(({ user, role, createdAt }) => ({
    id: user.id,
    name: user.name,
    image: user.image,
    initials: user.initials,
    role,
    joinedAt: createdAt.toISOString(),
    tasks: user.commitments.map(toSocialTask),
    signal: user.checkIns[0]?.signal ?? null,
    note:
      user.checkIns[0]?.updates[0]?.journal ??
      user.checkIns[0]?.blocker ??
      null,
    valence: user.checkIns[0]?.updates[0]?.valence ?? null,
  }));
}

export async function getFeedPage({
  viewerId,
  circleId,
  cursor: rawCursor,
  memberId,
  limit = 20,
  proofIds,
  checkInIds,
  streakEventIds,
  screenTimeIds,
  includeReplaced = false,
  pendingOnly = false,
  awaitingOnly = false,
  timelineOnly = false,
}: {
  viewerId: string;
  circleId: string;
  cursor?: string;
  memberId?: string;
  limit?: number;
  proofIds?: string[];
  checkInIds?: string[];
  streakEventIds?: string[];
  screenTimeIds?: string[];
  includeReplaced?: boolean;
  pendingOnly?: boolean;
  awaitingOnly?: boolean;
  timelineOnly?: boolean;
}): Promise<FeedPage> {
  await assertCircleMember(viewerId, circleId);
  if (memberId && memberId !== viewerId)
    await assertCircleMember(memberId, circleId);
  const cursor = rawCursor
    ? parseFeedCursor(
        rawCursor,
        circleId,
        pendingOnly
          ? "!review"
          : awaitingOnly
            ? "!pending"
            : timelineOnly
              ? "!timeline"
              : memberId,
      )
    : null;
  if (rawCursor && !cursor) throw new DomainError("Invalid feed cursor.");
  const size = Math.max(1, Math.min(limit, 50));
  const items = await readPosts({
    viewerId,
    circleId,
    cursor,
    memberId,
    take: size + 1,
    proofIds,
    checkInIds,
    streakEventIds,
    screenTimeIds,
    includeReplaced,
    pendingOnly,
    awaitingOnly,
    timelineOnly,
  });
  const page = items.slice(0, size);
  return {
    items: page,
    nextCursor:
      items.length > size
        ? encodeFeedCursor(
            page[page.length - 1],
            circleId,
            pendingOnly
              ? "!review"
              : awaitingOnly
                ? "!pending"
                : timelineOnly
                  ? "!timeline"
                  : memberId,
          )
        : null,
  };
}

async function readPosts({
  viewerId,
  circleId,
  cursor = null,
  memberId,
  take,
  proofIds,
  checkInIds,
  streakEventIds,
  screenTimeIds,
  includeReplaced = false,
  pendingOnly = false,
  awaitingOnly = false,
  timelineOnly = false,
  since,
  until,
}: {
  viewerId: string;
  circleId: string;
  cursor?: FeedCursor | null;
  memberId?: string;
  take?: number;
  proofIds?: string[];
  checkInIds?: string[];
  streakEventIds?: string[];
  screenTimeIds?: string[];
  includeReplaced?: boolean;
  pendingOnly?: boolean;
  awaitingOnly?: boolean;
  timelineOnly?: boolean;
  since?: Date;
  until?: Date;
}): Promise<FeedPost[]> {
  const prisma = getPrisma();
  const [proofs, updates, screenTimes, streaks, members] = await Promise.all([
    prisma.taskProof.findMany({
      where: {
        circleId,
        ...(!includeReplaced ? { replacedById: null } : {}),
        ...(timelineOnly
          ? {
              NOT: {
                reviewStatus: "PENDING" as const,
                commitment: reviewableCommitmentFilter(),
                ownerId: { not: viewerId },
                reviews: { none: { reviewerId: viewerId } },
              },
            }
          : {}),
        ...(pendingOnly || awaitingOnly
          ? {
              reviewStatus: "PENDING" as const,
              commitment: reviewableCommitmentFilter(),
              ownerId: { not: viewerId },
              reviews: { none: { reviewerId: viewerId } },
            }
          : {}),
        ...(memberId ? { ownerId: memberId } : {}),
        ...(proofIds ? { id: { in: proofIds } } : {}),
        ...feedBoundary("proof", "submittedAt", cursor),
        ...(since ? { submittedAt: { gt: since, lte: until } } : {}),
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        submittedAt: true,
        ownerNote: true,
        commitmentId: true,
        mediaIds: true,
        reviewStatus: true,
        replacedById: true,
        ownerId: true,
        owner: { select: socialAuthorSelect },
        commitment: {
          select: {
            title: true,
            dueAt: true,
            proofSubmittedAt: true,
            requiredApprovals: true,
            status: true,
          },
        },
        reviews: {
          select: {
            id: true,
            reviewerId: true,
            decision: true,
            note: true,
            _count: { select: { replies: true } },
            reviewer: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
        _count: { select: { likes: true, replies: true } },
      },
    }),
    prisma.checkInUpdate.findMany({
      where: {
        circleId,
        ...(memberId ? { userId: memberId } : {}),
        ...(pendingOnly || awaitingOnly
          ? { id: { in: [] } }
          : checkInIds
            ? { id: { in: checkInIds } }
            : {}),
        ...feedBoundary("check-in", "createdAt", cursor),
        ...(since ? { createdAt: { gt: since, lte: until } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      include: {
        user: { select: socialAuthorSelect },
        checkIn: { select: { _count: { select: { replies: true } } } },
        likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
        _count: { select: { likes: true, replies: true } },
      },
    }),
    prisma.screenTimeSubmission.findMany({
      where: {
        circleId,
        ...(memberId ? { userId: memberId } : {}),
        ...(pendingOnly || awaitingOnly
          ? { id: { in: [] } }
          : screenTimeIds
            ? { id: { in: screenTimeIds } }
            : proofIds || checkInIds || streakEventIds
              ? { id: { in: [] } }
              : {}),
        ...feedBoundary("screen-time", "submittedAt", cursor),
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take,
      include: {
        user: { select: socialAuthorSelect },
        reading: true,
        likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
        _count: { select: { likes: true, replies: true } },
      },
    }),
    prisma.streakEvent.findMany({
      where: {
        circleId,
        // Private streaks never post, but the feed must not depend on that.
        streak: { visibility: "CIRCLE" },
        ...(memberId ? { userId: memberId } : {}),
        ...(pendingOnly || awaitingOnly
          ? { id: { in: [] } }
          : streakEventIds
            ? { id: { in: streakEventIds } }
            : proofIds || checkInIds || screenTimeIds
              ? { id: { in: [] } }
              : {}),
        ...feedBoundary("streak", "createdAt", cursor),
        ...(since ? { createdAt: { gt: since, lte: until } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      include: {
        user: { select: socialAuthorSelect },
        streak: {
          select: { title: true, kind: true, unitLabel: true },
        },
        likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
        _count: { select: { likes: true, replies: true } },
      },
    }),
    prisma.membership.findMany({
      where: { circleId },
      select: { userId: true },
    }),
  ]);
  const items: FeedPost[] = [
    ...screenTimes.map(
      (submission): FeedPost => ({
        kind: "screen-time",
        id: submission.id,
        circleId,
        createdAt: submission.submittedAt.toISOString(),
        author: submission.user,
        body: null,
        likeCount: submission._count.likes,
        likedByMe: submission.likes.length > 0,
        commentCount: submission._count.replies,
        mediaId: submission.reading.mediaId,
        weekStart: submission.weekStart.toISOString().slice(0, 10),
        dailyAverageMinutes: submission.reading.dailyAverageMinutes,
      }),
    ),
    ...proofs.map(
      (p): FeedPost => ({
        kind: "proof",
        id: p.id,
        circleId,
        createdAt: p.submittedAt.toISOString(),
        author: p.owner,
        body: p.ownerNote,
        commitmentId: p.commitmentId,
        title: p.commitment.title,
        mediaIds: p.mediaIds,
        reviewStatus: p.reviewStatus,
        expired:
          p.commitment.status === "MISSED" ||
          shouldMarkMissed(
            p.commitment.status,
            p.commitment.dueAt,
            new Date(),
            p.commitment.proofSubmittedAt,
          ),
        canReview:
          !shouldMarkMissed(
            p.commitment.status,
            p.commitment.dueAt,
            new Date(),
            p.commitment.proofSubmittedAt,
          ) &&
          p.commitment.status !== "CANCELLED" &&
          p.commitment.status !== "MISSED" &&
          p.commitment.status !== "VERIFIED" &&
          p.replacedById === null &&
          p.reviewStatus === "PENDING" &&
          p.ownerId !== viewerId &&
          !p.reviews.some((r) => r.reviewerId === viewerId),
        ...proofApprovalProgress(
          p.ownerId,
          members.map((m) => m.userId),
          p.reviews,
          p.commitment.requiredApprovals,
        ),
        verifiedBy:
          p.reviews
            .filter((r) => r.decision === "APPROVED")
            .map((r) => r.reviewer?.name ?? "Deleted member")
            .join(", ") || null,
        likeCount: p._count.likes,
        likedByMe: p.likes.length > 0,
        commentCount:
          p._count.replies +
          p.reviews.reduce(
            (count, review) =>
              count + (review.note ? 1 : 0) + review._count.replies,
            0,
          ),
      }),
    ),
    ...updates.map(
      (u): FeedPost => ({
        kind: "check-in",
        id: u.id,
        circleId,
        createdAt: u.createdAt.toISOString(),
        author: u.user,
        body: u.journal ?? u.blocker,
        mediaIds: u.mediaIds,
        valence: u.valence,
        feelings: u.feelings,
        impacts: u.impacts,
        prompt: u.journal ? u.prompt : null,
        signal: u.signal,
        day: u.day.toISOString().slice(0, 10),
        checkInId: u.checkInId,
        legacyCommentCount: u.checkIn._count.replies,
        likeCount: u._count.likes,
        likedByMe: u.likes.length > 0,
        commentCount: u._count.replies,
      }),
    ),
    ...streaks.map(
      (event): FeedPost => ({
        kind: "streak",
        id: event.id,
        circleId,
        createdAt: event.createdAt.toISOString(),
        author: event.user,
        body: null,
        event: event.kind,
        streakId: event.streakId,
        streakTitle: event.streak.title,
        streakKind: event.streak.kind,
        unitLabel: event.streak.unitLabel,
        count: event.count,
        costCents: event.costCents,
        units: event.units,
        likeCount: event._count.likes,
        likedByMe: event.likes.length > 0,
        commentCount: event._count.replies,
      }),
    ),
  ].sort(compareFeedPosts);
  return items;
}
