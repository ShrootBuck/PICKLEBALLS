import { expect, test } from "bun:test";
import type { FeedPost, StoryGroup } from "@/lib/social-types";
import {
  expireStoryGroups,
  firstUnseenFrame,
  hasUnseenStory,
  orderStoryGroups,
  STORY_WINDOW_MS,
  storyFrameKey,
  storyFrames,
} from "@/lib/stories";
import {
  applyStoryViews,
  parseStoryViews,
  type StoryViewReceipt,
} from "@/lib/story-views";

function group(
  id: string,
  minute: number,
  seenFrames: number[] = [],
): StoryGroup {
  const author = { id, name: id, image: null, initials: id[0] };
  const post: FeedPost = {
    kind: "proof",
    id,
    circleId: "circle",
    author,
    createdAt: new Date(Date.UTC(2026, 8, 8, 20, minute)).toISOString(),
    body: null,
    title: "Finish the problem set",
    commitmentId: id,
    definitionOfDone: "All problems complete",
    mediaIds: ["i_photo", "v_video"],
    reviewStatus: "PENDING",
    canReview: true,
    requiredApprovals: 1,
    verifiedBy: null,
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
  };
  return { author, posts: [{ post, seenFrames }] };
}

test("your story stays first, unseen people precede seen people, recency breaks ties", () => {
  const groups = [
    group("seen", 50, [0, 1]),
    group("new", 40),
    group("you", 0),
    group("partly-seen", 30, [0]),
    group("older", 10),
  ];
  expect(orderStoryGroups(groups, "you").map((g) => g.author.id)).toEqual([
    "you",
    "new",
    "partly-seen",
    "older",
    "seen",
  ]);
  expect(groups[0].author.id).toBe("seen");
});

test("a person's story plays chronologically and resumes at their first unseen attachment", () => {
  const old = group("friend", 0, [0]);
  const recent = group("friend", 10);
  recent.posts[0].post.id = "newer";
  const sorted = orderStoryGroups(
    [{ author: old.author, posts: [...recent.posts, ...old.posts] }],
    "you",
  )[0];
  const frames = storyFrames(sorted);
  expect(frames.map((f) => f.post.id)).toEqual([
    "friend",
    "friend",
    "newer",
    "newer",
  ]);
  expect(firstUnseenFrame(sorted)).toBe(1);
  expect(frames[1].media).toMatchObject({ video: true });
  expect(frames[0].seen).toBe(true);
  expect(frames[1].seen).toBe(false);
});

test("legacy proof photos and text updates each have a frame; IDs cannot collide across post kinds", () => {
  const story = group("same", 0, [0]);
  const proof = story.posts[0].post;
  if (proof.kind === "proof") proof.mediaIds = [];
  expect(storyFrames(story)[0].media?.src).toBe("/api/proofs/same/image");
  const checkIn: FeedPost = {
    ...proof,
    kind: "check-in",
    signal: "YAY",
    day: "2026-09-08",
    checkInId: "day",
    legacyCommentCount: 0,
  };
  const text = {
    author: story.author,
    posts: [{ post: checkIn, seenFrames: [0] }],
  };
  expect(storyFrames(text)).toHaveLength(1);
  expect(storyFrames(text)[0].media).toBeNull();
  expect(storyFrameKey(proof, 0)).not.toBe(storyFrameKey(checkIn, 0));
  expect(firstUnseenFrame(text)).toBe(0);
});

test("empty groups are omitted and equal timestamps have deterministic order", () => {
  const a = group("a", 0),
    b = group("b", 0);
  expect(
    orderStoryGroups([a, { author: a.author, posts: [] }, b], "you").map(
      (g) => g.author.id,
    ),
  ).toEqual(["b", "a"]);
});

test("locally read attachments survive stale server data without clearing new frames", () => {
  const original = group("friend", 0);
  const receipt: StoryViewReceipt = {
    kind: "proof",
    id: "friend",
    frame: 0,
    createdAt: original.posts[0].post.createdAt,
    pending: true,
  };
  const now = new Date(receipt.createdAt).getTime() + 1000;
  const saved = parseStoryViews(JSON.stringify([receipt]), now);
  const merged = applyStoryViews([original], saved.values());
  expect(firstUnseenFrame(merged[0])).toBe(1);
  expect(hasUnseenStory(merged[0])).toBe(true);
  expect(original.posts[0].seenFrames).toEqual([]);
  const complete = applyStoryViews(merged, [{ ...receipt, frame: 1 }]);
  expect(hasUnseenStory(complete[0])).toBe(false);
  const fresh = group("friend", 1);
  fresh.posts[0].post.id = "new-proof";
  const withNew = applyStoryViews(
    [
      {
        author: original.author,
        posts: [...complete[0].posts, ...fresh.posts],
      },
    ],
    saved.values(),
  );
  expect(hasUnseenStory(withNew[0])).toBe(true);
  expect(firstUnseenFrame(withNew[0])).toBe(2);
});

test("local receipts preserve server reads and never cross post kinds", () => {
  const original = group("shared-id", 0, [1]);
  const receipt: StoryViewReceipt = {
    kind: "check-in",
    id: "shared-id",
    frame: 0,
    createdAt: original.posts[0].post.createdAt,
    pending: false,
  };
  expect(applyStoryViews([original], [receipt])[0].posts[0].seenFrames).toEqual(
    [1],
  );
  const merged = applyStoryViews([original], [{ ...receipt, kind: "proof" }]);
  expect(hasUnseenStory(merged[0])).toBe(false);
  expect(
    applyStoryViews(merged, [{ ...receipt, kind: "proof" }])[0].posts[0]
      .seenFrames,
  ).toHaveLength(2);
});

test("local read history rejects damaged storage, invalid frames, and expired receipts", () => {
  const createdAt = "2026-09-14T12:00:00.000Z";
  const now = new Date(createdAt).getTime() + 1000;
  const valid = {
    kind: "proof",
    id: "post",
    frame: 0,
    createdAt,
    pending: true,
  };
  expect(parseStoryViews("broken", now).size).toBe(0);
  expect(parseStoryViews('{"not":"an array"}', now).size).toBe(0);
  expect(
    parseStoryViews(
      JSON.stringify([
        null,
        {},
        valid,
        { ...valid, frame: -1 },
        { ...valid, frame: 0.5 },
        { ...valid, frame: 101 },
        { ...valid, kind: "unknown" },
        { ...valid, createdAt: "invalid" },
        { ...valid, pending: "true" },
        { ...valid, createdAt: new Date(now + 1000).toISOString() },
      ]),
      now,
    ).size,
  ).toBe(1);
  expect(
    parseStoryViews(JSON.stringify([valid]), now + STORY_WINDOW_MS).size,
  ).toBe(0);
});

test("unread checks require each real attachment and ignore duplicate or foreign frame indexes", () => {
  expect(hasUnseenStory(group("partial", 0, [0, 0, 9]))).toBe(true);
  expect(hasUnseenStory(group("complete", 0, [0, 1, 9]))).toBe(false);
  const legacy = group("legacy", 0);
  if (legacy.posts[0].post.kind === "proof") legacy.posts[0].post.mediaIds = [];
  expect(hasUnseenStory(legacy)).toBe(true);
  legacy.posts[0].seenFrames = [0];
  expect(hasUnseenStory(legacy)).toBe(false);
});

test("expiry keeps quiet ticks stable and removes expired frames at the 24-hour boundary", () => {
  const older = group("older", 0, [0]);
  const recent = group("recent", 30);
  const groups = [older, recent];
  const boundary =
    new Date(older.posts[0].post.createdAt).getTime() + STORY_WINDOW_MS;
  expect(expireStoryGroups(groups, boundary - 1)).toBe(groups);
  const expired = expireStoryGroups(groups, boundary);
  expect(expired).toEqual([recent]);
  expect(expired[0]).toBe(recent);
  expect(groups).toHaveLength(2);
  const mixed = [
    { author: older.author, posts: [...older.posts, ...recent.posts] },
  ];
  const partial = expireStoryGroups(mixed, boundary);
  expect(partial[0].posts).toEqual(recent.posts);
  expect(mixed[0].posts).toHaveLength(2);
});
