import "server-only";
import { DomainError } from "@/lib/errors";
import {
  compareFeedPosts,
  encodeFeedCursor,
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
import { requiredApprovalsForCircle } from "@/lib/task-policy";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export const socialAuthorSelect = {
  id: true,
  name: true,
  image: true,
  initials: true,
} as const;
export const socialTaskInclude = {
  proofs: {
    where: { replacedById: null },
    orderBy: { submittedAt: "desc" },
    take: 1,
    select: { id: true, reviewStatus: true },
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
  definitionOfDone: string;
  day: Date;
  dueAt: Date;
  status: SocialTask["status"];
  proofs: NonNullable<SocialTask["proof"]>[];
}): SocialTask {
  return {
    id: task.id,
    title: task.title,
    definitionOfDone: task.definitionOfDone,
    day: task.day.toISOString().slice(0, 10),
    dueAt: task.dueAt.toISOString(),
    status:
      !task.proofs.length &&
      task.dueAt < new Date() &&
      ["OPEN", "RENEGOTIATED"].includes(task.status)
        ? "MISSED"
        : task.status,
    proof: task.proofs[0] ?? null,
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
            where: { circleId, day },
            orderBy: { createdAt: "asc" },
            include: socialTaskInclude,
          },
          checkIns: {
            where: { circleId, day },
            take: 1,
            select: { signal: true, blocker: true },
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
    note: user.checkIns[0]?.blocker ?? null,
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
  includeReplaced = false,
  pendingOnly = false,
}: {
  viewerId: string;
  circleId: string;
  cursor?: string;
  memberId?: string;
  limit?: number;
  proofIds?: string[];
  checkInIds?: string[];
  includeReplaced?: boolean;
  pendingOnly?: boolean;
}): Promise<FeedPage> {
  await assertCircleMember(viewerId, circleId);
  if (memberId && memberId !== viewerId)
    await assertCircleMember(memberId, circleId);
  const cursor = rawCursor
    ? parseFeedCursor(rawCursor, circleId, pendingOnly ? "!review" : memberId)
    : null;
  if (rawCursor && !cursor) throw new DomainError("Invalid feed cursor.");
  const size = Math.max(1, Math.min(limit, 50));
  const prisma = getPrisma();
  const [proofs, updates, members] = await Promise.all([
    prisma.taskProof.findMany({
      where: {
        circleId,
        ...(!includeReplaced ? { replacedById: null } : {}),
        ...(pendingOnly
          ? {
              reviewStatus: "PENDING" as const,
              ownerId: { not: viewerId },
              reviews: { none: { reviewerId: viewerId } },
            }
          : {}),
        ...(memberId ? { ownerId: memberId } : {}),
        ...(proofIds ? { id: { in: proofIds } } : {}),
        ...feedBoundary("proof", "submittedAt", cursor),
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: size + 1,
      include: {
        owner: { select: socialAuthorSelect },
        commitment: { select: { title: true, definitionOfDone: true } },
        reviews: {
          select: {
            reviewerId: true,
            decision: true,
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
        ...(pendingOnly
          ? { id: { in: [] } }
          : checkInIds
            ? { id: { in: checkInIds } }
            : {}),
        ...feedBoundary("check-in", "createdAt", cursor),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: size + 1,
      include: {
        user: { select: socialAuthorSelect },
        checkIn: { select: { _count: { select: { replies: true } } } },
        likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
        _count: { select: { likes: true, replies: true } },
      },
    }),
    prisma.membership.count({ where: { circleId } }),
  ]);
  const items: FeedPost[] = [
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
        definitionOfDone: p.commitment.definitionOfDone,
        mediaIds: p.mediaIds,
        reviewStatus: p.reviewStatus,
        canReview:
          p.replacedById === null &&
          p.reviewStatus === "PENDING" &&
          p.ownerId !== viewerId &&
          !p.reviews.some((r) => r.reviewerId === viewerId),
        requiredApprovals: requiredApprovalsForCircle(members),
        verifiedBy:
          p.reviews.find((r) => r.decision === "APPROVED")?.reviewer.name ??
          null,
        likeCount: p._count.likes,
        likedByMe: p.likes.length > 0,
        commentCount: p._count.replies,
      }),
    ),
    ...updates.map(
      (u): FeedPost => ({
        kind: "check-in",
        id: u.id,
        circleId,
        createdAt: u.createdAt.toISOString(),
        author: u.user,
        body: u.blocker,
        signal: u.signal,
        day: u.day.toISOString().slice(0, 10),
        checkInId: u.checkInId,
        legacyCommentCount: u.checkIn._count.replies,
        likeCount: u._count.likes,
        likedByMe: u.likes.length > 0,
        commentCount: u._count.replies,
      }),
    ),
  ].sort(compareFeedPosts);
  const page = items.slice(0, size);
  return {
    items: page,
    nextCursor:
      items.length > size
        ? encodeFeedCursor(
            page[page.length - 1],
            circleId,
            pendingOnly ? "!review" : memberId,
          )
        : null,
  };
}
