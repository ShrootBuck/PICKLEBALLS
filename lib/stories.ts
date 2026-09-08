import { compareFeedPosts } from "@/lib/feed-cursor";
import {
  type FeedPost,
  postKey,
  type StoryFrame,
  type StoryGroup,
} from "@/lib/social-types";

export const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function storyFrameKey(
  post: Pick<FeedPost, "kind" | "id">,
  frame: number,
) {
  return `${postKey(post)}:${frame}`;
}

export function storyFrames(group: StoryGroup): StoryFrame[] {
  return group.posts.flatMap(({ post, seenFrames }) => {
    const media =
      post.kind === "proof"
        ? post.mediaIds.length
          ? post.mediaIds.map((id) => ({
              src: `/api/media/${encodeURIComponent(id)}`,
              video: id.startsWith("v_"),
            }))
          : [
              {
                src: `/api/proofs/${encodeURIComponent(post.id)}/image`,
                video: false,
              },
            ]
        : [null];
    return media.map((item, frame) => ({
      key: storyFrameKey(post, frame),
      post,
      frame,
      seen: seenFrames.includes(frame),
      media: item,
    }));
  });
}

export function orderStoryGroups(groups: StoryGroup[], viewerId: string) {
  const prepared = groups
    .filter((group) => group.posts.length)
    .map((group) => ({
      ...group,
      posts: [...group.posts].sort((a, b) => -compareFeedPosts(a.post, b.post)),
    }));
  return prepared.sort(
    (a, b) =>
      Number(b.author.id === viewerId) - Number(a.author.id === viewerId) ||
      Number(storyFrames(b).some((frame) => !frame.seen)) -
        Number(storyFrames(a).some((frame) => !frame.seen)) ||
      compareFeedPosts(
        a.posts[a.posts.length - 1].post,
        b.posts[b.posts.length - 1].post,
      ) ||
      a.author.id.localeCompare(b.author.id),
  );
}

export function firstUnseenFrame(group: StoryGroup) {
  return Math.max(
    0,
    storyFrames(group).findIndex((frame) => !frame.seen),
  );
}
