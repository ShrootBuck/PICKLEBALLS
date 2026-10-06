import {
  afterAll,
  beforeAll,
  expect,
  mock,
  setSystemTime,
  test,
} from "bun:test";
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
const { setPostLike } = await import("@/lib/post-likes");
const { createSocialReply } = await import("@/lib/social-replies");
const {
  createCommitment,
  submitProof,
  challengeProof,
  updateCommitment,
  setCheckIn,
  reconcileMissedTasks,
} = await import("@/lib/tasks");
const { resolveLegacyFocus } = await import("@/lib/social-routing");
const { notifyReplyReceived } = await import("@/lib/notifications");
const { confirmScreenTime } = await import("@/lib/screen-time-server");
const { latestScreenTimeWeek } = await import("@/lib/screen-time");
const { requireDateKey } = await import("@/lib/time");
const prisma = getPrisma();
const now = new Date("2026-09-08T20:00:00Z");
const start = new Date("2026-09-08T19:00:00Z");
setSystemTime(now);
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
async function challengeCircle(name: string) {
  const circleId = `${name}-${randomUUID()}`;
  await prisma.circle.create({
    data: { id: circleId, slug: circleId, name },
  });
  await prisma.membership.createMany({
    data: [ids.owner, ids.peer, ids.outsider].map((userId) => ({
      userId,
      circleId,
      role: userId === ids.owner ? ("OWNER" as const) : ("MEMBER" as const),
    })),
  });
  return circleId;
}

async function postProof(circleId: string) {
  const commitment = await task(ids.owner, circleId);
  return submitProof(
    commitment.id,
    ids.owner,
    circleId,
    [await media(ids.owner, circleId)],
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
  setSystemTime();
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
  await prisma.screenTimeReading.createMany({
    data: Array.from({ length: 23 }, (_, i) => ({
      id: `equal-screen-reading-${i}`,
      userId: ids.owner,
      circleId: circle.id,
      mediaId: `equal-screen-media-${i}`,
      dailyAverageMinutes: 120,
      weekStart: new Date(now.getTime() - i * 7 * 86400_000),
    })),
  });
  await prisma.screenTimeSubmission.createMany({
    data: Array.from({ length: 23 }, (_, i) => ({
      id: `equal-screen-${String(i).padStart(2, "0")}`,
      userId: ids.owner,
      circleId: circle.id,
      readingId: `equal-screen-reading-${i}`,
      weekStart: new Date(now.getTime() - i * 7 * 86400_000),
      submittedAt: now,
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
  expect(all).toHaveLength(74);
  expect(new Set(all).size).toBe(74);
  expect(all[49]).toBe("equal-proof-00");
  expect(all[50]).toBe("equal-check-23");
  await expect(
    getFeedPage({
      viewerId: ids.owner,
      circleId: circle.id,
      memberId: ids.outsider,
    }),
  ).rejects.toThrow("Member not found");
});

test("proof is done immediately; a challenge updates its status without reordering", async () => {
  const posted = await proof();
  expect(
    (
      await prisma.commitment.findUniqueOrThrow({
        where: { id: posted.commitmentId },
      })
    ).status,
  ).toBe("DONE");
  let page = await getFeedPage({ viewerId: ids.peer, circleId: ids.circle });
  const before = page.items.find((p) => p.id === posted.id);
  expect(before).toMatchObject({
    kind: "proof",
    challenged: false,
    canChallenge: true,
    expired: false,
    commentCount: 0,
  });
  const ownerView = (
    await getFeedPage({ viewerId: ids.owner, circleId: ids.circle })
  ).items.find((p) => p.id === posted.id);
  expect(ownerView).toMatchObject({ challenged: false, canChallenge: false });
  await challengeProof(
    posted.id,
    ids.peer,
    ids.circle,
    { reason: "The last answer has no working." },
    now,
  );
  page = await getFeedPage({ viewerId: ids.peer, circleId: ids.circle });
  const after = page.items.find((p) => p.id === posted.id);
  expect(after?.createdAt).toBe(before?.createdAt);
  expect(after).toMatchObject({
    challenged: true,
    canChallenge: false,
    commentCount: 1,
  });
  expect(
    (
      await prisma.commitment.findUniqueOrThrow({
        where: { id: posted.commitmentId },
      })
    ).status,
  ).toBe("OPEN");
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

test("comment and challenge likes persist, isolate circles, and cascade on deletion", async () => {
  const { getProofDiscussion } = await import("@/lib/proof-discussion");
  const posted = await proof();
  const reply = await createSocialReply(ids.owner, ids.circle, {
    targetType: "PROOF",
    targetId: posted.id,
    body: "A comment worth liking",
  });
  const challenge = await challengeProof(
    posted.id,
    ids.peer,
    ids.circle,
    { reason: "The second page is blurry." },
    now,
  );
  for (const [targetType, targetId] of [
    ["REPLY", reply.id],
    ["CHALLENGE", challenge.id],
  ] as const) {
    const input = { targetType, targetId, liked: true };
    expect(
      await Promise.all([
        setPostLike(ids.peer, ids.circle, input),
        setPostLike(ids.peer, ids.circle, input),
      ]),
    ).toEqual([
      { likeCount: 1, likedByMe: true },
      { likeCount: 1, likedByMe: true },
    ]);
    expect(await setPostLike(ids.owner, ids.circle, input)).toEqual({
      likeCount: 2,
      likedByMe: true,
    });
    await expect(setPostLike(ids.outsider, ids.circle, input)).rejects.toThrow(
      "Member not found",
    );
    await expect(setPostLike(ids.outsider, ids.other, input)).rejects.toThrow(
      "Post not found",
    );
    await setPostLike(ids.owner, ids.circle, { ...input, liked: false });
    expect(
      await setPostLike(ids.owner, ids.circle, { ...input, liked: false }),
    ).toEqual({ likeCount: 1, likedByMe: false });
  }
  const peer = await getProofDiscussion(
    ids.circle,
    posted.id,
    undefined,
    ids.peer,
  );
  const owner = await getProofDiscussion(
    ids.circle,
    posted.id,
    undefined,
    ids.owner,
  );
  for (const rows of [peer.replies, peer.challenges])
    expect(rows[0]).toMatchObject({ likeCount: 1, likedByMe: true });
  for (const rows of [owner.replies, owner.challenges])
    expect(rows[0]).toMatchObject({ likeCount: 1, likedByMe: false });
  await expect(
    Promise.resolve(
      prisma.postLike.create({
        data: {
          userId: ids.owner,
          circleId: ids.circle,
          proofId: posted.id,
          replyId: reply.id,
        },
      }),
    ),
  ).rejects.toThrow();
  await prisma.socialReply.delete({ where: { id: reply.id } });
  await prisma.proofChallenge.delete({ where: { id: challenge.id } });
  expect(
    await prisma.postLike.count({
      where: { OR: [{ replyId: reply.id }, { challengeId: challenge.id }] },
    }),
  ).toBe(0);
  await expect(
    setPostLike(ids.peer, ids.circle, {
      targetType: "REPLY",
      targetId: reply.id,
      liked: true,
    }),
  ).rejects.toThrow("Post not found");
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
    url: `/posts/check-in/${first.update.id}?circle=${ids.circle}#comments`,
    replyId: a.id,
  });
});

test("challenge, deliberate replacement restrictions, and old URLs preserve proof history", async () => {
  const posted = await proof();
  for (const reason of ["", "   ", "x".repeat(501)])
    await expect(
      challengeProof(posted.id, ids.peer, ids.circle, { reason }, now),
    ).rejects.toThrow(
      "Say what is missing. Reasons must be 500 characters or fewer.",
    );
  await expect(
    challengeProof(posted.id, ids.peer, ids.circle, {}, now),
  ).rejects.toThrow("Say what is missing.");
  await expect(
    challengeProof(
      posted.id,
      ids.owner,
      ids.circle,
      { reason: "Mine is incomplete" },
      now,
    ),
  ).rejects.toThrow("You cannot challenge your own proof.");
  await expect(
    challengeProof(
      posted.id,
      ids.outsider,
      ids.circle,
      { reason: "Not my circle" },
      now,
    ),
  ).rejects.toThrow("You are no longer in this circle.");
  await expect(
    challengeProof(
      posted.id,
      ids.outsider,
      ids.other,
      { reason: "Wrong circle" },
      now,
    ),
  ).rejects.toThrow("Proof not found.");
  expect(
    await prisma.proofChallenge.count({ where: { proofId: posted.id } }),
  ).toBe(0);
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
  ).rejects.toThrow("This task already has proof.");
  const challenge = await challengeProof(
    posted.id,
    ids.peer,
    ids.circle,
    { reason: "  The last page is missing.  " },
    now,
  );
  expect(challenge).toMatchObject({
    proofId: posted.id,
    challengerId: ids.peer,
    circleId: ids.circle,
    reason: "The last page is missing.",
  });
  expect(
    await prisma.activityEvent.count({
      where: { entityId: posted.id, kind: "PROOF_CHALLENGED" },
    }),
  ).toBe(1);
  expect(
    await prisma.notification.findUnique({
      where: { dedupeKey: `challenge:${challenge.id}:${ids.owner}` },
    }),
  ).toMatchObject({ kind: "PROOF_CHALLENGED", recipientId: ids.owner });
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
  const focused = await resolveLegacyFocus(ids.circle, challenge.id);
  expect(focused).toContain(`/posts/proof/${posted.id}`);
  expect(focused).toContain(`&focus=${challenge.id}#comments`);
  expect(await resolveLegacyFocus(ids.other, challenge.id)).toBeNull();
  await expect(
    updateCommitment(
      posted.commitmentId,
      ids.owner,
      ids.circle,
      { title: "Easier task" },
      now,
    ),
  ).rejects.toThrow("promise stays fixed");
});

test("solo circles finish on post; deadlines close first submissions but allow challenged replacements", async () => {
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
  expect(posted.isLate).toBe(false);
  expect(
    (await prisma.commitment.findUniqueOrThrow({ where: { id: solo.id } }))
      .status,
  ).toBe("DONE");
  expect(
    (await getFeedPage({ viewerId: ids.owner, circleId: ids.solo })).items.find(
      (p) => p.id === posted.id,
    ),
  ).toMatchObject({ challenged: false, canChallenge: false });
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
  ).rejects.toThrow("window is closed");
  const challenged = await proof();
  await challengeProof(
    challenged.id,
    ids.peer,
    ids.circle,
    { reason: "Missing page" },
    now,
  );
  const afterDeadline = new Date("2026-09-09T20:00:00Z");
  const replacement = await submitProof(
    challenged.commitmentId,
    ids.owner,
    ids.circle,
    [await media()],
    "",
    start,
    now,
    afterDeadline,
  );
  expect(replacement.isLate).toBe(false);
  expect(
    (
      await prisma.commitment.findUniqueOrThrow({
        where: { id: challenged.commitmentId },
      })
    ).status,
  ).toBe("DONE");
  await expect(
    submitProof(
      challenged.commitmentId,
      ids.owner,
      ids.circle,
      [await media()],
      "",
      start,
      now,
      afterDeadline,
    ),
  ).rejects.toThrow("This task already has proof.");
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
  expect(
    (
      await prisma.commitment.findUniqueOrThrow({
        where: { id: commitment.id },
      })
    ).status,
  ).toBe("DONE");
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
  const before = await getFeedPage({
    viewerId: ids.peer,
    circleId: ids.circle,
  });
  expect(
    before.items.some(
      (post) => post.kind === "screen-time" && post.mediaId === reading.mediaId,
    ),
  ).toBe(false);
  const first = await confirmScreenTime(ids.owner, ids.circle, reading.id);
  const second = await confirmScreenTime(ids.owner, ids.circle, reading.id);
  expect(first.id).toBe(second.id);
  const after = await getFeedPage({ viewerId: ids.peer, circleId: ids.circle });
  expect(
    after.items.some(
      (post) => post.kind === "screen-time" && post.id === first.id,
    ),
  ).toBe(true);
  expect(
    await prisma.screenTimeSubmission.count({
      where: { readingId: reading.id },
    }),
  ).toBe(1);

  expect(
    await setPostLike(ids.peer, ids.circle, {
      targetType: "SCREEN_TIME",
      targetId: first.id,
      liked: true,
    }),
  ).toEqual({ likeCount: 1, likedByMe: true });
  await createSocialReply(ids.peer, ids.circle, {
    targetType: "SCREEN_TIME",
    targetId: first.id,
    body: "Nice drop this week",
  });
  const notification = await prisma.notification.findFirstOrThrow({
    where: {
      recipientId: ids.owner,
      kind: "REPLY_POSTED",
      entityId: first.id,
    },
  });
  expect((notification.data as { url: string }).url).toContain(
    `/posts/screen-time/${first.id}`,
  );
  const detail = await getFeedPage({
    viewerId: ids.peer,
    circleId: ids.circle,
    proofIds: [],
    checkInIds: [],
    screenTimeIds: [first.id],
  });
  expect(detail.items).toHaveLength(1);
  expect(detail.items[0]).toMatchObject({
    kind: "screen-time",
    id: first.id,
    likeCount: 1,
    likedByMe: true,
    commentCount: 1,
  });
});

test("pending video proof stays private, reserves attachments, and publishes exactly once after encoding", async () => {
  const { queueProof } = await import("@/lib/pending-proof");
  const commitment = await task();
  const video = `v_${randomUUID()}`;
  await prisma.mediaUpload.create({
    data: {
      id: video,
      ownerId: ids.owner,
      circleId: ids.circle,
      mimeType: "video/mp4",
      sizeBytes: BigInt(5 * 1024 ** 3),
      objectKey: `staging/${video}`,
      uploadedAt: now,
    },
  });
  const queued = await queueProof(
    commitment.id,
    ids.owner,
    ids.circle,
    [video],
    "Big video",
    start,
    now,
    now,
  );
  expect(
    (
      await queueProof(
        commitment.id,
        ids.owner,
        ids.circle,
        [video],
        "Big video",
        start,
        now,
        now,
      )
    ).id,
  ).toBe(queued.id);
  expect(
    await prisma.taskProof.count({ where: { commitmentId: commitment.id } }),
  ).toBe(0);
  await expect(
    submitProof(
      commitment.id,
      ids.owner,
      ids.circle,
      [video],
      null,
      start,
      now,
      now,
    ),
  ).rejects.toThrow("processing");
  await expect(
    submitProof(
      commitment.id,
      ids.owner,
      ids.circle,
      [video],
      null,
      start,
      now,
      now,
      queued.id,
    ),
  ).rejects.toThrow("Attachments");
  await prisma.mediaUpload.update({
    where: { id: video },
    data: { ready: true, progress: 100 },
  });
  const published = await submitProof(
    commitment.id,
    ids.owner,
    ids.circle,
    [video],
    queued.note,
    start,
    now,
    queued.createdAt,
    queued.id,
  );
  const retried = await submitProof(
    commitment.id,
    ids.owner,
    ids.circle,
    [video],
    queued.note,
    start,
    now,
    queued.createdAt,
    queued.id,
  );
  expect(retried.id).toBe(published.id);
  expect(
    await prisma.taskProof.count({ where: { commitmentId: commitment.id } }),
  ).toBe(1);
  expect(
    (await prisma.pendingProof.findUniqueOrThrow({ where: { id: queued.id } }))
      .proofId,
  ).toBe(published.id);
  expect(
    (await prisma.mediaUpload.findUniqueOrThrow({ where: { id: video } }))
      .claimed,
  ).toBe(true);
  expect(published.isLate).toBe(false);
});

test("pending proof rejects foreign media and late submissions atomically", async () => {
  const { queueProof } = await import("@/lib/pending-proof");
  const commitment = await task();
  const foreign = await media(ids.outsider, ids.other);
  await expect(
    queueProof(
      commitment.id,
      ids.owner,
      ids.circle,
      [foreign],
      null,
      start,
      now,
      now,
    ),
  ).rejects.toThrow("Attachments");
  expect(
    await prisma.pendingProof.count({ where: { commitmentId: commitment.id } }),
  ).toBe(0);
  const own = await media();
  await expect(
    queueProof(
      commitment.id,
      ids.owner,
      ids.circle,
      [own],
      null,
      start,
      now,
      new Date("2026-09-09T20:00:00Z"),
    ),
  ).rejects.toThrow("closed");
  expect(
    (await prisma.mediaUpload.findUniqueOrThrow({ where: { id: own } }))
      .pendingProofId,
  ).toBeNull();
});

test("a queued submission cannot publish after its owner leaves the circle", async () => {
  const { queueProof } = await import("@/lib/pending-proof");
  const userId = `departed-${randomUUID()}`;
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@example.invalid`,
      name: "Departed member",
    },
  });
  await prisma.membership.create({ data: { userId, circleId: ids.circle } });
  const commitment = await task(userId);
  const attachment = await media(userId);
  const pending = await queueProof(
    commitment.id,
    userId,
    ids.circle,
    [attachment],
    null,
    start,
    now,
    now,
  );
  await prisma.membership.delete({
    where: { userId_circleId: { userId, circleId: ids.circle } },
  });
  await expect(
    submitProof(
      commitment.id,
      userId,
      ids.circle,
      [attachment],
      null,
      start,
      now,
      now,
      pending.id,
    ),
  ).rejects.toThrow("no longer a member");
  expect(
    await prisma.taskProof.count({ where: { commitmentId: commitment.id } }),
  ).toBe(0);
});

test("mood posts preserve full journals and feelings in circle timelines without expiry", async () => {
  const journal = "A longer reflection.\n".repeat(100);
  const { update } = await setCheckIn(
    ids.owner,
    ids.circle,
    "NAY",
    undefined,
    now,
    {
      valence: -57,
      feelings: ["Worried", "Tired"],
      impacts: ["school", "sleep"],
      prompt: "What about school is making you feel worried?",
      journal,
    },
  );
  const later = await setCheckIn(ids.owner, ids.circle, "YAY", undefined, now, {
    valence: 86,
    feelings: ["Excited", "Joyful"],
    impacts: [],
    prompt: "What made you feel excited?",
    journal: "",
  });
  expect(update.journal).toBe(journal.trim());
  expect(update.feelings).toEqual(["Worried", "Tired"]);
  expect(update.valence).toBe(-57);
  expect(later.update.valence).toBe(86);
  expect(later.update.prompt).toBeNull();
  const feed = await getFeedPage({
    viewerId: ids.peer,
    circleId: ids.circle,
    proofIds: [],
    checkInIds: [update.id, later.update.id],
  });
  expect(feed.items).toHaveLength(2);
  const saved = feed.items.find((post) => post.id === update.id);
  expect(saved?.body).toBe(journal.trim());
  expect(saved?.kind === "check-in" && saved.valence).toBe(-57);
  expect(saved?.kind === "check-in" && saved.feelings).toEqual([
    "Worried",
    "Tired",
  ]);
  expect(saved?.kind === "check-in" && saved.impacts).toEqual([
    "school",
    "sleep",
  ]);
  expect(saved?.kind === "check-in" && saved.prompt).toBe(
    "What about school is making you feel worried?",
  );
  const first = await getFeedPage({
    viewerId: ids.peer,
    circleId: ids.circle,
    proofIds: [],
    checkInIds: [update.id, later.update.id],
    limit: 1,
  });
  const second = await getFeedPage({
    viewerId: ids.peer,
    circleId: ids.circle,
    proofIds: [],
    checkInIds: [update.id, later.update.id],
    limit: 1,
    cursor: first.nextCursor ?? undefined,
  });
  expect([...first.items, ...second.items].map((post) => post.id)).toEqual(
    feed.items.map((post) => post.id),
  );
  await expect(
    getFeedPage({ viewerId: ids.outsider, circleId: ids.circle }),
  ).rejects.toThrow("Member not found");
});

test("the challenge window closes 24 hours after proof posts", async () => {
  const circleId = await challengeCircle("window");
  const posted = await postProof(circleId);
  const lastMoment = new Date(posted.submittedAt.getTime() + 86_400_000 - 1);
  const closed = new Date(posted.submittedAt.getTime() + 86_400_000);
  try {
    setSystemTime(lastMoment);
    expect(
      (await getFeedPage({ viewerId: ids.peer, circleId })).items[0],
    ).toMatchObject({ id: posted.id, canChallenge: true });
    setSystemTime(closed);
    expect(
      (await getFeedPage({ viewerId: ids.peer, circleId })).items[0],
    ).toMatchObject({ id: posted.id, canChallenge: false, expired: false });
  } finally {
    setSystemTime(now);
  }
  await expect(
    challengeProof(
      posted.id,
      ids.peer,
      circleId,
      { reason: "Too late" },
      closed,
    ),
  ).rejects.toThrow("Proof can only be challenged within 24 hours of posting.");
  expect(
    await prisma.proofChallenge.count({ where: { proofId: posted.id } }),
  ).toBe(0);
  expect(
    (
      await prisma.commitment.findUniqueOrThrow({
        where: { id: posted.commitmentId },
      })
    ).status,
  ).toBe("DONE");
  await expect(
    challengeProof(
      posted.id,
      ids.peer,
      circleId,
      { reason: "Just in time" },
      lastMoment,
    ),
  ).resolves.toMatchObject({ proofId: posted.id, challengerId: ids.peer });
});

test("a proof accepts exactly one challenge, even from concurrent challengers", async () => {
  const circleId = await challengeCircle("single-challenge");
  const posted = await postProof(circleId);
  const results = await Promise.allSettled([
    challengeProof(posted.id, ids.peer, circleId, { reason: "Blurry" }, now),
    challengeProof(
      posted.id,
      ids.outsider,
      circleId,
      { reason: "Cut off" },
      now,
    ),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason.message).toBe("This proof was already challenged.");
  const challenge = fulfilled[0].value;
  for (const challengerId of [ids.peer, ids.outsider])
    await expect(
      challengeProof(
        posted.id,
        challengerId,
        circleId,
        { reason: "Again" },
        now,
      ),
    ).rejects.toThrow("This proof was already challenged.");
  expect(
    await prisma.proofChallenge.findMany({ where: { proofId: posted.id } }),
  ).toEqual([challenge]);
  expect(
    await prisma.activityEvent.count({
      where: { circleId, entityId: posted.id, kind: "PROOF_CHALLENGED" },
    }),
  ).toBe(1);
  expect(
    await prisma.notification.count({
      where: { circleId, recipientId: ids.owner, kind: "PROOF_CHALLENGED" },
    }),
  ).toBe(1);
  for (const viewerId of [ids.owner, ids.peer, ids.outsider])
    expect((await getFeedPage({ viewerId, circleId })).items[0]).toMatchObject({
      id: posted.id,
      challenged: true,
      canChallenge: false,
      commentCount: 1,
    });
});

test("replacement proof after a challenge finishes the task and can be challenged again", async () => {
  const circleId = await challengeCircle("replacement");
  const posted = await postProof(circleId);
  await challengeProof(
    posted.id,
    ids.peer,
    circleId,
    { reason: "The photo is cropped." },
    now,
  );
  const status = async () =>
    (
      await prisma.commitment.findUniqueOrThrow({
        where: { id: posted.commitmentId },
      })
    ).status;
  expect(await status()).toBe("OPEN");
  const replacedAt = new Date(now.getTime() + 60_000);
  const replacement = await submitProof(
    posted.commitmentId,
    ids.owner,
    circleId,
    [await media(ids.owner, circleId)],
    "Full photo",
    start,
    replacedAt,
    replacedAt,
  );
  expect(await status()).toBe("DONE");
  const feed = await getFeedPage({ viewerId: ids.outsider, circleId });
  expect(feed.items.map((post) => post.id)).toEqual([replacement.id]);
  expect(feed.items[0]).toMatchObject({
    challenged: false,
    canChallenge: true,
    commentCount: 0,
  });
  await expect(
    challengeProof(posted.id, ids.outsider, circleId, { reason: "Old" }, now),
  ).rejects.toThrow("This proof was already challenged.");
  const second = await challengeProof(
    replacement.id,
    ids.outsider,
    circleId,
    { reason: "Still missing the last answer." },
    replacedAt,
  );
  expect(second.proofId).toBe(replacement.id);
  expect(await status()).toBe("OPEN");
  const third = await submitProof(
    posted.commitmentId,
    ids.owner,
    circleId,
    [await media(ids.owner, circleId)],
    null,
    start,
    replacedAt,
    new Date(replacedAt.getTime() + 1),
  );
  expect(await status()).toBe("DONE");
  expect(
    (
      await prisma.taskProof.findUniqueOrThrow({
        where: { id: replacement.id },
      })
    ).replacedById,
  ).toBe(third.id);
});

test("proof discussion includes the challenge reason, paginates replies, and isolates circles", async () => {
  const { getProofDiscussion } = await import("@/lib/proof-discussion");
  const posted = await proof();
  const later = new Date(now.getTime() + 1000);
  await prisma.socialReply.createMany({
    data: Array.from({ length: 55 }, (_, index) => ({
      id: `discussion-${posted.id}-${String(index).padStart(2, "0")}`,
      circleId: ids.circle,
      authorId: ids.owner,
      body: `Comment ${index}`,
      proofId: posted.id,
      createdAt: later,
    })),
  });
  const commentCount = async () =>
    (
      await getFeedPage({
        viewerId: ids.owner,
        circleId: ids.circle,
        proofIds: [posted.id],
        checkInIds: [],
      })
    ).items[0].commentCount;
  expect((await getProofDiscussion(ids.circle, posted.id)).challenges).toEqual(
    [],
  );
  expect(await commentCount()).toBe(55);
  const challenge = await challengeProof(
    posted.id,
    ids.peer,
    ids.circle,
    { reason: "The graph axes are unlabeled." },
    now,
  );
  const first = await getProofDiscussion(ids.circle, posted.id);
  expect(first.replies).toHaveLength(50);
  expect(first.hasMore).toBe(true);
  expect(first.challenges).toHaveLength(1);
  expect(first.challenges[0]).toMatchObject({
    id: challenge.id,
    body: "The graph axes are unlabeled.",
    createdAt: now.toISOString(),
    author: { id: ids.peer },
    likeCount: 0,
    likedByMe: false,
    challenge: true,
  });
  const second = await getProofDiscussion(
    ids.circle,
    posted.id,
    first.replies.at(-1)?.id,
  );
  expect(second.replies).toHaveLength(5);
  expect(second.hasMore).toBe(false);
  expect(second.challenges).toHaveLength(1);
  expect(
    new Set([...first.replies, ...second.replies].map((reply) => reply.id))
      .size,
  ).toBe(55);
  const other = await getProofDiscussion(ids.other, posted.id);
  expect(other.replies).toEqual([]);
  expect(other.challenges).toEqual([]);
  await expect(
    getProofDiscussion(ids.other, posted.id, first.replies[0].id),
  ).rejects.toThrow("Reply not found");
  expect(await commentCount()).toBe(56);
  expect(await resolveLegacyFocus(ids.circle, challenge.id)).toBe(
    `/posts/proof/${posted.id}?circle=${ids.circle}&focus=${challenge.id}#comments`,
  );
  expect(await resolveLegacyFocus(ids.other, challenge.id)).toBeNull();
});

test("check-in media is claimed atomically and included in the feed", async () => {
  const photo = await media();
  const video = `v_${randomUUID()}`;
  await prisma.mediaUpload.create({
    data: {
      id: video,
      ownerId: ids.owner,
      circleId: ids.circle,
      mimeType: "video/mp4",
      sizeBytes: 100,
      objectKey: video,
      ready: true,
    },
  });
  const { update } = await setCheckIn(
    ids.owner,
    ids.circle,
    "YAY",
    undefined,
    now,
    {
      valence: 57,
      feelings: [],
      impacts: [],
      journal: "Today",
      mediaIds: [photo, video],
    },
  );
  const feed = await getFeedPage({
    viewerId: ids.peer,
    circleId: ids.circle,
    proofIds: [],
    checkInIds: [update.id],
  });
  expect(feed.items[0].kind === "check-in" && feed.items[0].mediaIds).toEqual([
    photo,
    video,
  ]);
  expect(
    await prisma.mediaUpload.count({
      where: { id: { in: [photo, video] }, claimed: true },
    }),
  ).toBe(2);
  for (const invalid of [
    photo,
    await media(ids.peer),
    await media(ids.owner, ids.other),
    await media(ids.owner, ids.circle, false),
  ]) {
    const fresh = await media();
    const before = await prisma.checkInUpdate.count();
    await expect(
      setCheckIn(ids.owner, ids.circle, "YAY", undefined, now, {
        valence: 57,
        feelings: [],
        impacts: [],
        journal: "",
        mediaIds: [fresh, invalid],
      }),
    ).rejects.toThrow("Attachments are unavailable");
    expect(await prisma.checkInUpdate.count()).toBe(before);
    expect(
      (await prisma.mediaUpload.findUniqueOrThrow({ where: { id: fresh } }))
        .claimed,
    ).toBe(false);
  }
});

test("overnight tasks remain visible and accept queued proof after midnight", async () => {
  const { getSocialMembers } = await import("@/lib/social-data");
  const { queueProof } = await import("@/lib/pending-proof");
  const { phoenixDateKey } = await import("@/lib/time");
  const morning = new Date();
  const yesterday = new Date(morning.getTime() - 23 * 60 * 60 * 1000);
  const commitment = await task(ids.owner, ids.circle, yesterday);
  expect(commitment.dueAt.getTime() - commitment.createdAt.getTime()).toBe(
    86400000,
  );
  const members = await getSocialMembers(ids.circle, phoenixDateKey(morning));
  expect(
    members
      .find((m) => m.id === ids.owner)
      ?.tasks.some((t) => t.id === commitment.id),
  ).toBe(true);
  const queued = await queueProof(
    commitment.id,
    ids.owner,
    ids.circle,
    [await media()],
    null,
    new Date(morning.getTime() - 60000),
    morning,
    morning,
  );
  const posted = await submitProof(
    commitment.id,
    ids.owner,
    ids.circle,
    queued.mediaIds,
    null,
    queued.startedAt,
    queued.completedAt,
    queued.createdAt,
    queued.id,
  );
  expect(posted.isLate).toBe(false);
});

test("hourly reconciliation misses only tasks without an accepted submission", async () => {
  const { queueProof } = await import("@/lib/pending-proof");
  const circle = await prisma.circle.create({
    data: { slug: `expiration-${randomUUID()}`, name: "Expiration" },
  });
  await prisma.membership.createMany({
    data: [ids.owner, ids.peer].map((userId) => ({
      userId,
      circleId: circle.id,
    })),
  });
  const createdAt = new Date(now.getTime() - 86_400_000);
  const postedAt = new Date(now.getTime() - 60_000);
  const open = await task(ids.owner, circle.id, createdAt);
  const renegotiated = await task(ids.owner, circle.id, createdAt);
  await updateCommitment(
    renegotiated.id,
    ids.owner,
    circle.id,
    {
      title: "Changed promise",
    },
    postedAt,
  );
  const done = await task(ids.owner, circle.id, createdAt);
  const posted = await submitProof(
    done.id,
    ids.owner,
    circle.id,
    [await media(ids.owner, circle.id)],
    null,
    createdAt,
    postedAt,
    postedAt,
  );
  const disputed = await task(ids.owner, circle.id, createdAt);
  const challenged = await submitProof(
    disputed.id,
    ids.owner,
    circle.id,
    [await media(ids.owner, circle.id)],
    null,
    createdAt,
    postedAt,
    postedAt,
  );
  await challengeProof(
    challenged.id,
    ids.peer,
    circle.id,
    { reason: "Only half the page is visible." },
    postedAt,
  );
  const encoding = await task(ids.owner, circle.id, createdAt);
  const attachment = await media(ids.owner, circle.id);
  const queued = await queueProof(
    encoding.id,
    ids.owner,
    circle.id,
    [attachment],
    null,
    createdAt,
    postedAt,
    postedAt,
  );
  const fresh = await task(
    ids.owner,
    circle.id,
    new Date(createdAt.getTime() + 1),
  );
  const status = async (id: string) =>
    (await prisma.commitment.findUniqueOrThrow({ where: { id } })).status;

  const feed = await getFeedPage({ viewerId: ids.peer, circleId: circle.id });
  expect(feed.items.find((post) => post.id === posted.id)).toMatchObject({
    expired: false,
    challenged: false,
    canChallenge: true,
  });
  expect(feed.items.find((post) => post.id === challenged.id)).toMatchObject({
    expired: false,
    challenged: true,
    canChallenge: false,
  });
  expect((await reconcileMissedTasks(circle.id, now)).count).toBe(2);
  expect((await reconcileMissedTasks(circle.id, now)).count).toBe(0);
  expect(
    await prisma.commitment.count({
      where: { id: { in: [open.id, renegotiated.id] }, status: "MISSED" },
    }),
  ).toBe(2);
  expect(await status(done.id)).toBe("DONE");
  expect(await status(disputed.id)).toBe("OPEN");
  expect(await status(encoding.id)).toBe("OPEN");
  expect(await status(fresh.id)).toBe("OPEN");
  const muchLater = new Date(now.getTime() + 365 * 86_400_000);
  expect((await reconcileMissedTasks(circle.id, muchLater)).count).toBe(1);
  expect(await status(fresh.id)).toBe("MISSED");
  expect(await status(disputed.id)).toBe("OPEN");
  await expect(
    challengeProof(
      posted.id,
      ids.peer,
      circle.id,
      { reason: "Far too late" },
      muchLater,
    ),
  ).rejects.toThrow("within 24 hours");
  const replacement = await submitProof(
    disputed.id,
    ids.owner,
    circle.id,
    [await media(ids.owner, circle.id)],
    null,
    createdAt,
    postedAt,
    muchLater,
  );
  expect(replacement.isLate).toBe(false);
  expect(await status(disputed.id)).toBe("DONE");
  const published = await submitProof(
    encoding.id,
    ids.owner,
    circle.id,
    queued.mediaIds,
    null,
    queued.startedAt,
    queued.completedAt,
    queued.createdAt,
    queued.id,
  );
  expect(published.isLate).toBe(false);
  expect(await status(encoding.id)).toBe("DONE");
  expect(
    await prisma.notification.count({
      where: { entityId: published.id, kind: "PROOF_SUBMITTED" },
    }),
  ).toBe(1);
  await expect(
    submitProof(
      open.id,
      ids.owner,
      circle.id,
      [await media(ids.owner, circle.id)],
      null,
      createdAt,
      now,
      now,
    ),
  ).rejects.toThrow("submission window");
});

test("reconciliation drains multiple batches and never duplicates missed activity", async () => {
  const circle = await prisma.circle.create({
    data: { slug: `batches-${randomUUID()}`, name: "Batches" },
  });
  const createdAt = new Date(now.getTime() - 86_400_000);
  await prisma.commitment.createMany({
    data: Array.from({ length: 31 }, (_, index) => ({
      userId: ids.owner,
      circleId: circle.id,
      day: requireDateKey("2026-09-07"),
      createdAt,
      dueAt: now,
      title: `Task ${index}`,
      status: "OPEN" as const,
    })),
  });
  const firstBatch = await reconcileMissedTasks(circle.id, now);
  expect(firstBatch.count).toBe(25);
  expect(firstBatch.hasMore).toBe(true);
  const secondBatch = await reconcileMissedTasks(circle.id, now);
  expect(secondBatch.count).toBe(6);
  expect(secondBatch.hasMore).toBe(false);
  expect((await reconcileMissedTasks(circle.id, now)).count).toBe(0);
  expect(
    await prisma.activityEvent.count({
      where: { circleId: circle.id, kind: "TASK_MISSED" },
    }),
  ).toBe(31);
});

test("inbox rows commit with mutations and roll back with a failed transaction", async () => {
  const { createNotificationAndPush, withNotifications } = await import(
    "@/lib/notifications"
  );
  const posted = await proof();
  const submitted = await prisma.notification.findUnique({
    where: { dedupeKey: `proof:${posted.id}:${ids.peer}` },
  });
  expect(submitted?.kind).toBe("PROOF_SUBMITTED");
  const challenge = await challengeProof(
    posted.id,
    ids.peer,
    ids.circle,
    { reason: "The answers are not legible." },
    now,
  );
  expect(
    await prisma.notification.findUnique({
      where: { dedupeKey: `challenge:${challenge.id}:${ids.owner}` },
    }),
  ).toMatchObject({
    kind: "PROOF_CHALLENGED",
    recipientId: ids.owner,
    actorId: ids.peer,
  });
  // The challenger has not commented, but the challenge makes them a participant.
  const ownerReply = await createSocialReply(ids.owner, ids.circle, {
    targetType: "PROOF",
    targetId: posted.id,
    body: "Retaking the photo now",
  });
  expect(
    (
      await prisma.notification.findUnique({
        where: { dedupeKey: `reply:${ownerReply.id}:${ids.peer}` },
      })
    )?.kind,
  ).toBe("REPLY_POSTED");
  const reply = await createSocialReply(ids.peer, ids.circle, {
    targetType: "PROOF",
    targetId: posted.id,
    body: "A comment with an inbox entry",
  });
  expect(
    (
      await prisma.notification.findUnique({
        where: { dedupeKey: `reply:${reply.id}:${ids.owner}` },
      })
    )?.kind,
  ).toBe("REPLY_POSTED");

  const dedupeKey = `rollback:${randomUUID()}`;
  await expect(
    withNotifications(async (_tx, context) => {
      await createNotificationAndPush(
        {
          recipientId: ids.owner,
          actorId: ids.peer,
          circleId: ids.circle,
          kind: "REPLY_POSTED",
          title: "Should roll back",
          body: "Test",
          dedupeKey,
        },
        context,
      );
      expect(context.pushes).toHaveLength(1);
      throw new Error("Mutation failed");
    }),
  ).rejects.toThrow("Mutation failed");
  expect(
    await prisma.notification.findUnique({ where: { dedupeKey } }),
  ).toBeNull();
});

test("a late challenge reopens an on-time task and permits replacement proof", async () => {
  const { queueProof } = await import("@/lib/pending-proof");
  const posted = await proof();
  const lastMoment = new Date(posted.submittedAt.getTime() + 86_400_000 - 1);
  const later = new Date(now.getTime() + 200 * 86_400_000);
  await challengeProof(
    posted.id,
    ids.peer,
    ids.circle,
    { reason: "Need a clearer photo" },
    lastMoment,
  );
  const status = async () =>
    (
      await prisma.commitment.findUniqueOrThrow({
        where: { id: posted.commitmentId },
      })
    ).status;
  await reconcileMissedTasks(ids.circle, later);
  expect(await status()).toBe("OPEN");
  const queued = await queueProof(
    posted.commitmentId,
    ids.owner,
    ids.circle,
    [await media()],
    null,
    start,
    now,
    later,
  );
  const replacement = await submitProof(
    posted.commitmentId,
    ids.owner,
    ids.circle,
    queued.mediaIds,
    null,
    start,
    now,
    later,
    queued.id,
  );
  expect(replacement.isLate).toBe(false);
  expect(await status()).toBe("DONE");
  await expect(
    challengeProof(
      replacement.id,
      ids.peer,
      ids.circle,
      { reason: "Still blurry" },
      replacement.submittedAt,
    ),
  ).resolves.toMatchObject({ proofId: replacement.id });
  expect(await status()).toBe("OPEN");
});

test("bucket ideas become opt-in dated plans, resist stale RSVPs, and confirm only actual participants", async () => {
  const {
    proposeBucketItem,
    planBucketItem,
    voteOnBucketItem,
    requestBucketItemCompletion,
  } = await import("@/lib/bucket-list");
  const { getBucketItem, countBucketVotesAwaiting } = await import(
    "@/lib/bucket-list-data"
  );
  const { removeCircleMember } = await import("@/lib/circles");
  const circleId = `plans-${randomUUID()}`;
  const people = Array.from({ length: 8 }, () => `planner-${randomUUID()}`);
  await prisma.user.createMany({
    data: people.map((id) => ({
      id,
      email: `${id}@example.invalid`,
      name: id,
    })),
  });
  await prisma.circle.create({
    data: { id: circleId, slug: circleId, name: "Topgolf" },
  });
  await prisma.membership.createMany({
    data: people.map((userId, index) => ({
      userId,
      circleId,
      role: index === 0 ? ("OWNER" as const) : ("MEMBER" as const),
    })),
  });
  const idea = await proposeBucketItem(
    people[0],
    circleId,
    { circleId, title: "Topgolf" },
    now,
  );
  expect(idea.status).toBe("PROPOSED");
  const when = new Date(now.getTime() + 86_400_000);
  const settings = {
    scheduledFor: when.toISOString(),
    minimumParticipants: 3,
    everyoneRequired: false,
    planVersion: 0,
  };
  await expect(
    planBucketItem(idea.id, people[1], circleId, settings, now),
  ).rejects.toThrow("proposer");
  await planBucketItem(idea.id, people[0], circleId, settings, now);
  await expect(
    voteOnBucketItem(
      idea.id,
      people[1],
      circleId,
      { stage: "RSVP", inFavor: true, planVersion: 0 },
      now,
    ),
  ).rejects.toThrow("changed");
  for (const userId of people.slice(0, 7))
    await voteOnBucketItem(
      idea.id,
      userId,
      circleId,
      { stage: "RSVP", inFavor: true, planVersion: 1 },
      now,
    );
  await voteOnBucketItem(
    idea.id,
    people[7],
    circleId,
    { stage: "RSVP", inFavor: false, planVersion: 1 },
    now,
  );
  expect((await getBucketItem(circleId, idea.id, people[7]))?.item.status).toBe(
    "ACTIVE",
  );
  // Rescheduling clears RSVPs, not interest, and old browser actions cannot carry over.
  await planBucketItem(
    idea.id,
    people[0],
    circleId,
    { ...settings, planVersion: 1 },
    now,
  );
  const fresh = (await getBucketItem(circleId, idea.id, people[0]))?.item;
  expect(fresh).toMatchObject({
    stage: "RSVP",
    myVote: null,
    status: "PROPOSED",
    planVersion: 2,
  });
  for (const userId of people.slice(0, 3))
    await voteOnBucketItem(
      idea.id,
      userId,
      circleId,
      { stage: "RSVP", inFavor: true, planVersion: 2 },
      now,
    );
  // Dropping below the minimum reopens attendance, and people can rejoin.
  await voteOnBucketItem(
    idea.id,
    people[2],
    circleId,
    { stage: "RSVP", inFavor: false, planVersion: 2 },
    now,
  );
  expect((await getBucketItem(circleId, idea.id, people[0]))?.item.status).toBe(
    "PROPOSED",
  );
  await voteOnBucketItem(
    idea.id,
    people[2],
    circleId,
    { stage: "RSVP", inFavor: true, planVersion: 2 },
    now,
  );
  await expect(
    requestBucketItemCompletion(
      idea.id,
      people[7],
      circleId,
      { planVersion: 2, participantIds: people.slice(0, 2) },
      when,
    ),
  ).rejects.toThrow("someone going");
  // Third RSVP was a no-show. Only two actual attendees need to confirm.
  await requestBucketItemCompletion(
    idea.id,
    people[0],
    circleId,
    { planVersion: 2, participantIds: people.slice(0, 2) },
    when,
  );
  expect(await countBucketVotesAwaiting(circleId, people[7])).toBe(0);
  await expect(
    voteOnBucketItem(
      idea.id,
      people[7],
      circleId,
      { stage: "COMPLETION", inFavor: true, planVersion: 2 },
      when,
    ),
  ).rejects.toThrow("participants");
  await removeCircleMember(people[1], circleId, people[0]);
  expect((await getBucketItem(circleId, idea.id, people[0]))?.item.status).toBe(
    "ACTIVE",
  );
  // Removing a member must not silently finish the vote. Rejoining can finish it.
  await prisma.membership.create({ data: { userId: people[1], circleId } });
  expect(
    (
      await voteOnBucketItem(
        idea.id,
        people[1],
        circleId,
        { stage: "COMPLETION", inFavor: true, planVersion: 2 },
        when,
      )
    ).status,
  ).toBe("COMPLETED");

  const all = await proposeBucketItem(
    people[0],
    circleId,
    { circleId, title: "Everyone trip" },
    now,
  );
  await planBucketItem(
    all.id,
    people[0],
    circleId,
    { ...settings, everyoneRequired: true },
    now,
  );
  for (const userId of people.slice(0, 7))
    await voteOnBucketItem(
      all.id,
      userId,
      circleId,
      { stage: "RSVP", inFavor: true, planVersion: 1 },
      now,
    );
  await removeCircleMember(people[7], circleId, people[0]);
  expect((await getBucketItem(circleId, all.id, people[0]))?.item.status).toBe(
    "PROPOSED",
  );
  await planBucketItem(
    all.id,
    people[0],
    circleId,
    { ...settings, everyoneRequired: true, planVersion: 1 },
    now,
  );
  expect(
    (await getBucketItem(circleId, all.id, people[0]))?.item.requiredMemberIds,
  ).toHaveLength(7);
});
