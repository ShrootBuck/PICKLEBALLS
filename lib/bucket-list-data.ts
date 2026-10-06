import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  type BucketItemView,
  toBucketItemView,
} from "@/lib/bucket-list-policy";
import { getPrisma } from "@/lib/prisma";
import { socialAuthorSelect } from "@/lib/social-data";

const bucketItemInclude = {
  proposer: { select: socialAuthorSelect },
  completionRequestedBy: { select: socialAuthorSelect },
  votes: {
    select: {
      userId: true,
      stage: true,
      inFavor: true,
      user: { select: socialAuthorSelect },
    },
  },
  _count: { select: { replies: true } },
} satisfies Prisma.BucketItemInclude;

// Open votes the user has not answered. Authors are already counted as yes.
export function bucketVotesAwaitingFilter(circleId: string, userId: string) {
  return {
    circleId,
    OR: [
      {
        status: "PROPOSED",
        scheduledFor: null,
        votes: { none: { userId, stage: "PROPOSAL" } },
      },
      {
        status: { in: ["PROPOSED", "ACTIVE"] },
        scheduledFor: { not: null },
        completionRequestedAt: null,
        votes: { none: { userId, stage: "RSVP" } },
      },
      {
        status: "ACTIVE",
        completionRequestedAt: { not: null },
        completionParticipantIds: { has: userId },
        votes: { none: { userId, stage: "COMPLETION" } },
      },
    ],
  } satisfies Prisma.BucketItemWhereInput;
}

export function countBucketVotesAwaiting(circleId: string, userId: string) {
  return getPrisma().bucketItem.count({
    where: bucketVotesAwaitingFilter(circleId, userId),
  });
}

async function memberProfiles(circleId: string, viewerId: string) {
  const rows = await getPrisma().membership.findMany({
    where: { circleId },
    orderBy: { createdAt: "asc" },
    select: { role: true, user: { select: socialAuthorSelect } },
  });
  return {
    people: rows.map((row) => row.user),
    viewer: {
      id: viewerId,
      role: rows.find((row) => row.user.id === viewerId)?.role ?? "MEMBER",
    },
  };
}

export async function getBucketList(
  circleId: string,
  viewerId: string,
): Promise<{ items: BucketItemView[]; memberCount: number }> {
  const [members, items] = await Promise.all([
    memberProfiles(circleId, viewerId),
    getPrisma().bucketItem.findMany({
      where: { circleId, status: { not: "WITHDRAWN" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: bucketItemInclude,
    }),
  ]);
  const historicalPeople = await getPrisma().user.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            items.flatMap((item) => [
              ...item.requiredMemberIds,
              ...item.completionParticipantIds,
            ]),
          ),
        ],
      },
    },
    select: socialAuthorSelect,
  });
  return {
    items: items.map((item) =>
      toBucketItemView(item, members.people, members.viewer, historicalPeople),
    ),
    memberCount: members.people.length,
  };
}

export async function getBucketItem(
  circleId: string,
  itemId: string,
  viewerId: string,
) {
  const [members, item] = await Promise.all([
    memberProfiles(circleId, viewerId),
    getPrisma().bucketItem.findFirst({
      where: { id: itemId, circleId },
      include: bucketItemInclude,
    }),
  ]);
  if (!item) return null;
  const historicalPeople = await getPrisma().user.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...item.requiredMemberIds,
            ...item.completionParticipantIds,
          ]),
        ],
      },
    },
    select: socialAuthorSelect,
  });
  return {
    item: toBucketItemView(
      item,
      members.people,
      members.viewer,
      historicalPeople,
    ),
    members: members.people,
  };
}
