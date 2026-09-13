import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { getRecentPosts } from "@/lib/social-data";
import {
  postKey,
  type StoryContent,
  type StoryGroup,
} from "@/lib/social-types";
import { orderStoryGroups, STORY_WINDOW_MS } from "@/lib/stories";
import { serializable } from "@/lib/transaction";

export const storyViewSchema = z
  .object({
    circleId: z.string().min(1).max(100),
    kind: z.enum(["proof", "check-in", "screen-time"]),
    id: z.string().min(1).max(100),
    frame: z.number().int().min(0).max(100),
  })
  .strict();

export async function getStoryGroups(
  viewerId: string,
  circleId: string,
  now = new Date(),
): Promise<StoryGroup[]> {
  const since = new Date(now.getTime() - STORY_WINDOW_MS);
  const prisma = getPrisma();
  const [recentPosts, screenTimes] = await Promise.all([
    getRecentPosts(viewerId, circleId, since, now),
    prisma.screenTimeReading.findMany({
      where: {
        circleId,
        circle: { memberships: { some: { userId: viewerId } } },
        createdAt: { gt: since, lte: now },
        submission: { isNot: null },
      },
      include: {
        user: { select: { id: true, name: true, image: true, initials: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const posts: StoryContent[] = [
    ...recentPosts,
    ...screenTimes.map((reading) => ({
      kind: "screen-time" as const,
      id: reading.id,
      circleId: reading.circleId,
      createdAt: reading.createdAt.toISOString(),
      author: reading.user,
      body: null,
      likeCount: 0,
      likedByMe: false,
      commentCount: 0,
      mediaId: reading.mediaId,
      weekStart: reading.weekStart.toISOString().slice(0, 10),
      dailyAverageMinutes: reading.dailyAverageMinutes,
    })),
  ];
  if (!posts.length) return [];
  const views = await getPrisma().storyView.findMany({
    where: {
      viewerId,
      circleId,
      OR: [
        {
          screenTimeReadingId: { in: screenTimes.map((reading) => reading.id) },
        },
        {
          proofId: {
            in: posts.filter((p) => p.kind === "proof").map((p) => p.id),
          },
        },
        {
          checkInUpdateId: {
            in: posts.filter((p) => p.kind === "check-in").map((p) => p.id),
          },
        },
      ],
    },
    select: {
      proofId: true,
      checkInUpdateId: true,
      screenTimeReadingId: true,
      frame: true,
    },
  });
  const seen = new Map<string, number[]>();
  for (const view of views) {
    const key = view.proofId
      ? `proof:${view.proofId}`
      : view.screenTimeReadingId
        ? `screen-time:${view.screenTimeReadingId}`
        : `check-in:${view.checkInUpdateId}`;
    seen.set(key, [...(seen.get(key) ?? []), view.frame]);
  }
  const groups = new Map<string, StoryGroup>();
  for (const post of posts) {
    const group = groups.get(post.author.id) ?? {
      author: post.author,
      posts: [],
    };
    group.posts.push({ post, seenFrames: seen.get(postKey(post)) ?? [] });
    groups.set(post.author.id, group);
  }
  return orderStoryGroups([...groups.values()], viewerId);
}

export async function markStoryViewed(
  viewerId: string,
  input: z.infer<typeof storyViewSchema>,
  now = new Date(),
) {
  return serializable(async (tx) => {
    const circleId = input.circleId;
    const member = await tx.membership.findUnique({
      where: { userId_circleId: { userId: viewerId, circleId } },
    });
    if (!member) throw new DomainError("Story not found.", 404);
    const window = { gt: new Date(now.getTime() - STORY_WINDOW_MS), lte: now };
    const proof = input.kind === "proof";
    const target = proof
      ? await tx.taskProof.findFirst({
          where: {
            id: input.id,
            circleId,
            replacedById: null,
            submittedAt: window,
          },
          select: { id: true, mediaIds: true },
        })
      : input.kind === "screen-time"
        ? await tx.screenTimeReading.findFirst({
            where: {
              id: input.id,
              circleId,
              createdAt: window,
              submission: { isNot: null },
            },
            select: { id: true },
          })
        : await tx.checkInUpdate.findFirst({
            where: { id: input.id, circleId, createdAt: window },
            select: { id: true },
          });
    if (!target)
      throw new DomainError("This story is no longer available.", 404);
    const count =
      "mediaIds" in target && Array.isArray(target.mediaIds)
        ? Math.max(1, target.mediaIds.length)
        : 1;
    if (input.frame >= count)
      throw new DomainError("Story attachment not found.", 404);
    await tx.storyView.createMany({
      data: [
        {
          viewerId,
          circleId,
          frame: input.frame,
          viewedAt: now,
          ...(proof
            ? { proofId: target.id }
            : input.kind === "screen-time"
              ? { screenTimeReadingId: target.id }
              : { checkInUpdateId: target.id }),
        },
      ],
      skipDuplicates: true,
    });
    return { viewed: true };
  });
}
