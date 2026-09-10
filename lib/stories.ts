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

// Unread rings only need frame indexes, not a full set of media URLs.
export function hasUnseenStory(group: StoryGroup) {
  return group.posts.some(({ post, seenFrames }) => {
    const count = post.kind === "proof" ? Math.max(1, post.mediaIds.length) : 1;
    for (let frame = 0; frame < count; frame++) {
      if (!seenFrames.includes(frame)) return true;
    }
    return false;
  });
}

// Preserve references on quiet ticks so expiry checks do not rerender the app.
export function expireStoryGroups(groups: StoryGroup[], now = Date.now()) {
  let changed = false;
  const fresh = groups.flatMap((group) => {
    const posts = group.posts.filter(
      ({ post }) => now - new Date(post.createdAt).getTime() < STORY_WINDOW_MS,
    );
    if (posts.length === group.posts.length && posts.length) return [group];
    changed = true;
    return posts.length ? [{ ...group, posts }] : [];
  });
  return changed ? fresh : groups;
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
      Number(hasUnseenStory(b)) - Number(hasUnseenStory(a)) ||
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
