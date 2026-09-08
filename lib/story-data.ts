import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { getRecentPosts } from "@/lib/social-data";
import { postKey, type StoryGroup } from "@/lib/social-types";
import { orderStoryGroups, STORY_WINDOW_MS } from "@/lib/stories";
import { serializable } from "@/lib/transaction";

export const storyViewSchema = z
  .object({
    circleId: z.string().min(1).max(100),
    kind: z.enum(["proof", "check-in"]),
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
  const posts = await getRecentPosts(viewerId, circleId, since, now);
  const views = await getPrisma().storyView.findMany({
    where: {
      viewerId,
      circleId,
      OR: [
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
    select: { proofId: true, checkInUpdateId: true, frame: true },
  });
  const seen = new Map<string, number[]>();
  for (const view of views) {
    const key = view.proofId
      ? `proof:${view.proofId}`
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
          ...(proof ? { proofId: target.id } : { checkInUpdateId: target.id }),
        },
      ],
      skipDuplicates: true,
    });
    return { viewed: true };
  });
}
