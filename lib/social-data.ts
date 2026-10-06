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
  canChallengeProof,
  currentTaskFilter,
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
    select: { id: true, challenge: { select: { id: true } } },
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
  proofs: { id: string; challenge: { id: string } | null }[];
  goal?: SocialTask["goal"];
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
    proof: task.proofs[0]
      ? { id: task.proofs[0].id, challenged: task.proofs[0].challenge !== null }
      : null,
    goal: task.goal ?? null,
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
}): Promise<FeedPage> {
  await assertCircleMember(viewerId, circleId);
  if (memberId && memberId !== viewerId)
    await assertCircleMember(memberId, circleId);
  const cursor = rawCursor
    ? parseFeedCursor(rawCursor, circleId, memberId)
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
  });
  const page = items.slice(0, size);
  return {
    items: page,
    nextCursor:
      items.length > size
        ? encodeFeedCursor(page[page.length - 1], circleId, memberId)
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
  since?: Date;
  until?: Date;
}): Promise<FeedPost[]> {
  const prisma = getPrisma();
  const [proofs, updates, screenTimes, streaks] = await Promise.all([
    prisma.taskProof.findMany({
      where: {
        circleId,
        ...(!includeReplaced ? { replacedById: null } : {}),
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
        isLate: true,
        replacedById: true,
        ownerId: true,
        owner: { select: socialAuthorSelect },
        commitment: {
          select: {
            title: true,
            dueAt: true,
            proofSubmittedAt: true,
            status: true,
          },
        },
        challenge: { select: { id: true } },
        likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
        _count: { select: { likes: true, replies: true } },
      },
    }),
    prisma.checkInUpdate.findMany({
      where: {
        circleId,
        ...(memberId ? { userId: memberId } : {}),
        ...(checkInIds ? { id: { in: checkInIds } } : {}),
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
        ...(screenTimeIds
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
        ...(streakEventIds
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
  ]);
  const now = new Date();
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
        challenged: p.challenge !== null,
        expired:
          p.commitment.status === "MISSED" ||
          shouldMarkMissed(
            p.commitment.status,
            p.commitment.dueAt,
            now,
            p.commitment.proofSubmittedAt,
          ),
        canChallenge: canChallengeProof(
          {
            ...p,
            challenged: p.challenge !== null,
            taskStatus: p.commitment.status,
          },
          viewerId,
          now,
        ),
        likeCount: p._count.likes,
        likedByMe: p.likes.length > 0,
        // The challenge reason appears in the discussion alongside comments.
        commentCount: p._count.replies + (p.challenge ? 1 : 0),
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
