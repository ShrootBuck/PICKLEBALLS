import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error(
    "Run this suite with bun run test:social. It requires disposable Postgres.",
  );
mock.module("server-only", () => ({}));
const { getPrisma } = await import("@/lib/prisma");
const { getFeedPage } = await import("@/lib/social-data");
const { getStoryGroups, markStoryViewed } = await import("@/lib/story-data");
const { setPostLike } = await import("@/lib/post-likes");
const { createSocialReply } = await import("@/lib/social-replies");
const {
  createCommitment,
  submitProof,
  reviewProof,
  updateCommitment,
  setCheckIn,
} = await import("@/lib/tasks");
const { resolveLegacyFocus } = await import("@/lib/social-routing");
const { notifyReplyReceived } = await import("@/lib/notifications");
const { confirmScreenTime } = await import("@/lib/screen-time-server");
const { latestScreenTimeWeek } = await import("@/lib/screen-time");
const { requireDateKey } = await import("@/lib/time");
const prisma = getPrisma();
const now = new Date("2026-09-08T20:00:00Z");
const start = new Date("2026-09-08T19:00:00Z");
const ids = {
  circle: "test-circle",
  other: "other-circle",
  solo: "solo-circle",
  owner: "test-owner",
  peer: "test-peer",
  outsider: "test-outsider",
};
async function task(ownerId = ids.owner, circleId = ids.circle, date = now) {
  return createCommitment(
    ownerId,
    circleId,
    {
      title: "Finish physics problems",
      definitionOfDone: "Complete every question and show the working.",
    },
    date,
  );
}
async function media(ownerId = ids.owner, circleId = ids.circle, ready = true) {
  const id = `i_${randomUUID()}`;
  await prisma.mediaUpload.create({
    data: {
      id,
      ownerId,
      circleId,
      mimeType: "image/png",
      sizeBytes: 100,
      objectKey: id,
      ready,
    },
  });
  return id;
}
async function proof() {
  const commitment = await task();
  return submitProof(
    commitment.id,
    ids.owner,
    ids.circle,
    [await media()],
    null,
    start,
    now,
    now,
  );
}

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: ids.owner, email: "owner@example.invalid", name: "Owner" },
      { id: ids.peer, email: "peer@example.invalid", name: "Peer" },
      { id: ids.outsider, email: "outsider@example.invalid", name: "Outsider" },
    ],
  });
  await prisma.circle.createMany({
    data: [ids.circle, ids.other, ids.solo].map((id) => ({
      id,
      slug: id,
      name: id,
    })),
  });
  await prisma.membership.createMany({
    data: [
      { userId: ids.owner, circleId: ids.circle, role: "OWNER" },
      { userId: ids.peer, circleId: ids.circle },
      { userId: ids.outsider, circleId: ids.other },
      { userId: ids.owner, circleId: ids.solo, role: "OWNER" },
    ],
  });
});
afterAll(async () => {
  await prisma.$disconnect();
});

test("migration backfills only missing updates, preserves timestamps and day discussions", async () => {
  const updates = await prisma.checkInUpdate.findMany({
    where: { circleId: "legacy-circle" },
    orderBy: { createdAt: "asc" },
  });
  expect(updates.map((u) => u.id)).toEqual([
    "legacy_old-day",
    "existing-update",
  ]);
  expect(updates[0].createdAt.toISOString()).toBe("2026-08-01T18:12:34.123Z");
  const reply = await prisma.socialReply.findUniqueOrThrow({
    where: { id: "old-reply" },
  });
  expect(reply.checkInId).toBe("old-day");
  expect(reply.checkInUpdateId).toBeNull();
  expect(await resolveLegacyFocus("legacy-circle", "old-day")).toContain(
    "discussion=legacy",
  );
});

test("pagination visits every record exactly once across equal timestamps and kinds", async () => {
  const circle = await prisma.circle.create({
    data: { slug: "pagination", name: "Pagination" },
  });
  await prisma.membership.create({
    data: { userId: ids.owner, circleId: circle.id },
  });
  for (let i = 0; i < 27; i++) {
    const commitment = await task(ids.owner, circle.id);
    await prisma.taskProof.create({
      data: {
        id: `equal-proof-${String(i).padStart(2, "0")}`,
        ownerId: ids.owner,
        circleId: circle.id,
        commitmentId: commitment.id,
        startedAt: start,
        completedAt: now,
        submittedAt: now,
        isLate: false,
      },
    });
  }
  const { checkIn } = await setCheckIn(
    ids.owner,
    circle.id,
    "YAY",
    "First",
    now,
  );
  await prisma.checkInUpdate.deleteMany({ where: { circleId: circle.id } });
  await prisma.checkInUpdate.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({
      id: `equal-check-${String(i).padStart(2, "0")}`,
      checkInId: checkIn.id,
      userId: ids.owner,
      circleId: circle.id,
      day: requireDateKey("2026-09-08"),
      signal: "YAY" as const,
      createdAt: now,
    })),
  });
  let cursor: string | undefined;
  const all: string[] = [];
  do {
    const page = await getFeedPage({
      viewerId: ids.owner,
      circleId: circle.id,
      cursor,
    });
    expect(page.items.length).toBeLessThanOrEqual(20);
    all.push(...page.items.map((p) => p.id));
    cursor = page.nextCursor || undefined;
  } while (cursor);
  expect(all).toHaveLength(51);
  expect(new Set(all).size).toBe(51);
  expect(all[26]).toBe("equal-proof-00");
  expect(all[27]).toBe("equal-check-23");
  await expect(
    getFeedPage({
      viewerId: ids.owner,
      circleId: circle.id,
      memberId: ids.outsider,
    }),
  ).rejects.toThrow("Member not found");
});

test("pending proof is immediate; verdict updates its status without reordering", async () => {
  const posted = await proof();
  let page = await getFeedPage({ viewerId: ids.peer, circleId: ids.circle });
  const before = page.items.find((p) => p.id === posted.id);
  expect(before?.kind === "proof" && before.canReview).toBe(true);
  await reviewProof(
    posted.id,
    ids.peer,
    ids.circle,
    { decision: "APPROVED", note: "Every answer and working is visible." },
    now,
  );
  page = await getFeedPage({ viewerId: ids.peer, circleId: ids.circle });
  const after = page.items.find((p) => p.id === posted.id);
  expect(after?.createdAt).toBe(before?.createdAt);
  expect(after?.kind === "proof" && after.reviewStatus).toBe("APPROVED");
  expect(
    (
      await prisma.commitment.findUniqueOrThrow({
        where: { id: posted.commitmentId },
      })
    ).status,
  ).toBe("VERIFIED");
});

test("likes are idempotent, unique per target, isolated, and do not notify", async () => {
  const posted = await proof();
  const input = {
    targetType: "PROOF" as const,
    targetId: posted.id,
    liked: true,
  };
  const notifications = await prisma.notification.count();
  const results = await Promise.all([
    setPostLike(ids.peer, ids.circle, input),
    setPostLike(ids.peer, ids.circle, input),
  ]);
  expect(results).toEqual([
    { likeCount: 1, likedByMe: true },
    { likeCount: 1, likedByMe: true },
  ]);
  expect(await setPostLike(ids.owner, ids.circle, input)).toEqual({
    likeCount: 2,
    likedByMe: true,
  });
  await setPostLike(ids.peer, ids.circle, { ...input, liked: false });
  expect(
    await setPostLike(ids.peer, ids.circle, { ...input, liked: false }),
  ).toEqual({ likeCount: 1, likedByMe: false });
  await expect(setPostLike(ids.outsider, ids.circle, input)).rejects.toThrow(
    "Member not found",
  );
  await expect(setPostLike(ids.outsider, ids.other, input)).rejects.toThrow(
    "Post not found",
  );
  expect(await prisma.notification.count()).toBe(notifications);
  await expect(
    Promise.resolve(
      prisma.postLike.create({
        data: { userId: ids.peer, circleId: ids.circle },
      }),
    ),
  ).rejects.toThrow();
});

test("each check-in has independent comments and likes, while day comments stay intact", async () => {
  const first = await setCheckIn(
    ids.owner,
    ids.circle,
    "YAY",
    "Morning plan",
    now,
  );
  const second = await setCheckIn(
    ids.owner,
    ids.circle,
    "NAY",
    "Stuck on the last question",
    now,
  );
  const a = await createSocialReply(ids.peer, ids.circle, {
    targetType: "CHECK_IN_UPDATE",
    targetId: first.update.id,
    body: "Good start",
    mediaIds: [],
  });
  await createSocialReply(ids.peer, ids.circle, {
    targetType: "CHECK_IN_UPDATE",
    targetId: second.update.id,
    body: "I can explain that one",
    mediaIds: [],
  });
  await createSocialReply(ids.peer, ids.circle, {
    targetType: "CHECK_IN",
    targetId: first.checkIn.id,
    body: "Day discussion",
    mediaIds: [],
  });
  await setPostLike(ids.peer, ids.circle, {
    targetType: "CHECK_IN_UPDATE",
    targetId: first.update.id,
    liked: true,
  });
  const posts = (
    await getFeedPage({ viewerId: ids.peer, circleId: ids.circle })
  ).items.filter((p) => p.kind === "check-in");
  expect(posts.find((p) => p.id === first.update.id)?.commentCount).toBe(1);
  expect(posts.find((p) => p.id === second.update.id)?.likeCount).toBe(0);
  expect(posts.find((p) => p.id === first.update.id)?.legacyCommentCount).toBe(
    1,
  );
  await expect(
    createSocialReply(ids.outsider, ids.other, {
      targetType: "CHECK_IN_UPDATE",
      targetId: first.update.id,
      body: "No access",
      mediaIds: [],
    }),
  ).rejects.toThrow("Check-in not found");
  await expect(
    Promise.resolve(
      prisma.socialReply.create({
        data: {
          authorId: ids.peer,
          circleId: ids.circle,
          checkInId: first.checkIn.id,
          checkInUpdateId: first.update.id,
          body: "Invalid",
        },
      }),
    ),
  ).rejects.toThrow();
  await notifyReplyReceived({
    replyId: a.id,
    authorId: ids.peer,
    circleId: ids.circle,
  });
  const notice = await prisma.notification.findFirstOrThrow({
    where: { recipientId: ids.owner, entityId: first.update.id },
  });
  expect(notice.data).toMatchObject({
    url: `/posts/check-in/${first.update.id}?circle=${ids.circle}`,
    replyId: a.id,
  });
});

test("challenge, deliberate replacement restrictions, and old URLs preserve proof history", async () => {
  const posted = await proof();
  await expect(
    reviewProof(
      posted.id,
      ids.peer,
      ids.circle,
      { decision: "APPROVED", note: "" },
      now,
    ),
  ).rejects.toThrow("comment");
  await expect(
    reviewProof(
      posted.id,
      ids.owner,
      ids.circle,
      { decision: "APPROVED", note: "Mine" },
      now,
    ),
  ).rejects.toThrow("own homework");
  await expect(
    submitProof(
      posted.commitmentId,
      ids.owner,
      ids.circle,
      [await media()],
      "",
      start,
      now,
      now,
    ),
  ).rejects.toThrow("already has proof");
  await reviewProof(
    posted.id,
    ids.peer,
    ids.circle,
    { decision: "CHALLENGED", note: "The last page is missing." },
    now,
  );
  const replacement = await submitProof(
    posted.commitmentId,
    ids.owner,
    ids.circle,
    [await media()],
    "Added the missing page",
    start,
    now,
    new Date(now.getTime() + 1),
  );
  const page = await getFeedPage({ viewerId: ids.peer, circleId: ids.circle });
  expect(page.items.some((p) => p.id === posted.id)).toBe(false);
  expect(page.items.some((p) => p.id === replacement.id)).toBe(true);
  expect(
    (await prisma.taskProof.findUniqueOrThrow({ where: { id: posted.id } }))
      .replacedById,
  ).toBe(replacement.id);
  expect(await resolveLegacyFocus(ids.circle, posted.id)).toContain(
    `/posts/proof/${posted.id}`,
  );
  expect(await resolveLegacyFocus(ids.other, posted.id)).toBeNull();
  await expect(
    updateCommitment(
      posted.commitmentId,
      ids.owner,
      ids.circle,
      { title: "Easier task", definitionOfDone: "Just start" },
      now,
    ),
  ).rejects.toThrow("promise stays fixed");
});

test("solo circles verify immediately; midnight closes new and replacement proof", async () => {
  const solo = await task(ids.owner, ids.solo);
  const posted = await submitProof(
    solo.id,
    ids.owner,
    ids.solo,
    [await media(ids.owner, ids.solo)],
    "",
    start,
    now,
    now,
  );
  expect(posted.reviewStatus).toBe("APPROVED");
  const previous = await task(
    ids.owner,
    ids.circle,
    new Date("2026-09-07T20:00:00Z"),
  );
  await expect(
    submitProof(
      previous.id,
      ids.owner,
      ids.circle,
      [await media()],
      "",
      start,
      now,
      now,
    ),
  ).rejects.toThrow("day is closed");
  const challenged = await proof();
  await reviewProof(
    challenged.id,
    ids.peer,
    ids.circle,
    { decision: "CHALLENGED", note: "Missing page" },
    now,
  );
  await expect(
    submitProof(
      challenged.commitmentId,
      ids.owner,
      ids.circle,
      [await media()],
      "",
      start,
      now,
      new Date("2026-09-09T07:00:00Z"),
    ),
  ).rejects.toThrow("day is closed");
});

test("unready or wrong-circle media rolls back proof creation and preserves retry", async () => {
  const commitment = await task();
  const attachment = await media(ids.owner, ids.circle, false);
  await expect(
    submitProof(
      commitment.id,
      ids.owner,
      ids.circle,
      [attachment],
      "Keep this caption",
      start,
      now,
      now,
    ),
  ).rejects.toThrow("Attachments are unavailable");
  expect(
    await prisma.taskProof.count({ where: { commitmentId: commitment.id } }),
  ).toBe(0);
  await prisma.mediaUpload.update({
    where: { id: attachment },
    data: { ready: true },
  });
  const posted = await submitProof(
    commitment.id,
    ids.owner,
    ids.circle,
    [attachment],
    "Keep this caption",
    start,
    now,
    now,
  );
  expect(posted.ownerNote).toBe("Keep this caption");
  await prisma.taskProof.update({
    where: { id: posted.id },
    data: { aiStatus: "FAILED" },
  });
  await reviewProof(
    posted.id,
    ids.peer,
    ids.circle,
    { decision: "APPROVED", note: "The evidence is clear without AI." },
    now,
  );
  expect(
    (await prisma.taskProof.findUniqueOrThrow({ where: { id: posted.id } }))
      .reviewStatus,
  ).toBe("APPROVED");
});

test("feed access rejects nonmembers and foreign profile filters", async () => {
  await expect(
    getFeedPage({ viewerId: ids.outsider, circleId: ids.circle }),
  ).rejects.toThrow("Member not found");
  await expect(
    getFeedPage({
      viewerId: ids.owner,
      circleId: ids.circle,
      memberId: ids.outsider,
    }),
  ).rejects.toThrow("Member not found");
  const privatePage = await getFeedPage({
    viewerId: ids.outsider,
    circleId: ids.other,
  });
  expect(privatePage.items).toEqual([]);
});

test("screen-time readings stay private until confirmation and confirmation is idempotent", async () => {
  const reading = await prisma.screenTimeReading.create({
    data: {
      userId: ids.owner,
      circleId: ids.circle,
      mediaId: await media(),
      weekStart: requireDateKey(latestScreenTimeWeek()),
      dailyAverageMinutes: 123,
    },
  });
  expect(
    await prisma.screenTimeSubmission.count({
      where: { readingId: reading.id },
    }),
  ).toBe(0);
  await expect(
    confirmScreenTime(ids.peer, ids.circle, reading.id),
  ).rejects.toThrow();
  const first = await confirmScreenTime(ids.owner, ids.circle, reading.id);
  const second = await confirmScreenTime(ids.owner, ids.circle, reading.id);
  expect(first.id).toBe(second.id);
  expect(
    await prisma.screenTimeSubmission.count({
      where: { readingId: reading.id },
    }),
  ).toBe(1);
});

test("stories include every recent author beyond feed pagination and expire after 24 hours", async () => {
  const circleId = `story-circle-${randomUUID()}`;
  await prisma.circle.create({
    data: {
      id: circleId,
      slug: circleId,
      name: "Stories",
      memberships: { create: [{ userId: ids.owner }, { userId: ids.peer }] },
    },
  });
  const parent = await prisma.checkIn.create({
    data: {
      userId: ids.owner,
      circleId,
      day: requireDateKey("2026-09-08"),
      signal: "YAY",
    },
  });
  const peer = await prisma.checkIn.create({
    data: { userId: ids.peer, circleId, day: parent.day, signal: "NAY" },
  });
  const base = { circleId, day: parent.day, signal: "YAY" as const };
  await prisma.checkInUpdate.createMany({
    data: [
      ...Array.from({ length: 60 }, (_, i) => ({
        ...base,
        userId: ids.owner,
        checkInId: parent.id,
        createdAt: new Date(now.getTime() - i * 1000),
      })),
      {
        ...base,
        userId: ids.peer,
        checkInId: peer.id,
        id: `${circleId}-recent`,
        createdAt: new Date(now.getTime() - 23 * 3600_000),
      },
      {
        ...base,
        userId: ids.peer,
        checkInId: peer.id,
        id: `${circleId}-expired`,
        createdAt: new Date(now.getTime() - 24 * 3600_000),
      },
      {
        ...base,
        userId: ids.peer,
        checkInId: peer.id,
        id: `${circleId}-future`,
        createdAt: new Date(now.getTime() + 1000),
      },
    ],
  });
  const groups = await getStoryGroups(ids.owner, circleId, now);
  expect(groups[0].author.id).toBe(ids.owner);
  expect(groups[0].posts).toHaveLength(60);
  expect(groups[1].posts.map((p) => p.post.id)).toEqual([`${circleId}-recent`]);
  const input = {
    circleId,
    kind: "check-in" as const,
    id: `${circleId}-recent`,
    frame: 0,
  };
  await markStoryViewed(ids.owner, input, now);
  await markStoryViewed(ids.owner, input, now);
  expect(
    await prisma.storyView.count({ where: { viewerId: ids.owner, circleId } }),
  ).toBe(1);
  expect(
    (await getStoryGroups(ids.owner, circleId, now))[1].posts[0].seenFrames,
  ).toEqual([0]);
  expect(
    (await getStoryGroups(ids.peer, circleId, now)).find(
      (g) => g.author.id === ids.peer,
    )?.posts[0].seenFrames,
  ).toEqual([]);
  await expect(
    markStoryViewed(ids.owner, { ...input, id: `${circleId}-expired` }, now),
  ).rejects.toThrow("no longer available");
  await expect(
    markStoryViewed(ids.owner, { ...input, frame: 1 }, now),
  ).rejects.toThrow("attachment not found");
  await expect(markStoryViewed(ids.outsider, input, now)).rejects.toThrow(
    "not found",
  );
  await expect(getStoryGroups(ids.outsider, circleId, now)).rejects.toThrow(
    "not found",
  );
});

test("proof story views are per attachment, ignore replacements, and enforce receipt constraints", async () => {
  const p = await proof();
  const extra = await media();
  await prisma.taskProof.update({
    where: { id: p.id },
    data: { mediaIds: [...p.mediaIds, extra] },
  });
  const input = {
    circleId: ids.circle,
    kind: "proof" as const,
    id: p.id,
    frame: 0,
  };
  await markStoryViewed(ids.peer, input, now);
  const viewed = (await getStoryGroups(ids.peer, ids.circle, now))
    .flatMap((g) => g.posts)
    .find((item) => item.post.id === p.id);
  expect(viewed?.seenFrames).toEqual([0]);
  await markStoryViewed(ids.peer, { ...input, frame: 1 }, now);
  await expect(
    markStoryViewed(ids.peer, { ...input, frame: 2 }, now),
  ).rejects.toThrow("attachment not found");
  await expect(
    markStoryViewed(ids.outsider, { ...input, circleId: ids.other }, now),
  ).rejects.toThrow("no longer available");
  await expect(
    Promise.resolve(
      prisma.storyView.create({
        data: { viewerId: ids.peer, circleId: ids.circle, frame: 0 },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    Promise.resolve(
      prisma.storyView.create({
        data: {
          viewerId: ids.peer,
          circleId: ids.circle,
          proofId: p.id,
          frame: -1,
        },
      }),
    ),
  ).rejects.toThrow();
  const replacement = await proof();
  await prisma.taskProof.update({
    where: { id: p.id },
    data: { replacedById: replacement.id },
  });
  await expect(markStoryViewed(ids.peer, input, now)).rejects.toThrow(
    "no longer available",
  );
  expect(
    (await getStoryGroups(ids.peer, ids.circle, now))
      .flatMap((g) => g.posts)
      .some((item) => item.post.id === p.id),
  ).toBe(false);
});
