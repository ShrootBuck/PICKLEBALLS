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
  votes: { select: { userId: true, stage: true, inFavor: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.BucketItemInclude;

// Open votes the user has not answered. Authors are already counted as yes.
export function bucketVotesAwaitingFilter(circleId: string, userId: string) {
  return {
    circleId,
    OR: [
      {
        status: "PROPOSED",
        votes: { none: { userId, stage: "PROPOSAL" } },
      },
      {
        status: "ACTIVE",
        completionRequestedAt: { not: null },
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
  return {
    items: items.map((item) =>
      toBucketItemView(item, members.people, members.viewer),
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
  return {
    item: toBucketItemView(item, members.people, members.viewer),
    members: members.people,
  };
}
