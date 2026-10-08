import { afterAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error("Use bun run test:social. Disposable Postgres is required.");
mock.module("server-only", () => ({}));
const { getPrisma } = await import("@/lib/prisma");
const { deleteContent, changeCircleLifecycle, deleteOwnAccount } = await import(
  "@/lib/deletions"
);
const { removeCircleMember } = await import("@/lib/circles");
const { deleteSocialReply } = await import("@/lib/social-replies");
const { proofApprovalProgress, canSubmitProof } = await import(
  "@/lib/task-policy"
);
const { updateCommitment, submitProof } = await import("@/lib/tasks");
const { queueObjectDeletion, drainObjectDeletions } = await import(
  "@/lib/deletion-storage"
);
const db = getPrisma();
async function fixture() {
  const prefix = `deletion-${randomUUID()}`;
  const [owner, member, peer, outsider] = [
    "owner",
    "member",
    "peer",
    "outsider",
  ].map((role) => `${prefix}-${role}`);
  await db.user.createMany({
    data: [owner, member, peer, outsider].map((id) => ({
      id,
      email: `${id}@example.invalid`,
      name: id,
    })),
  });
  const circle = await db.circle.create({
    data: { name: "Deletion test", slug: prefix },
  });
  await db.membership.createMany({
    data: [
      { userId: owner, circleId: circle.id, role: "OWNER" },
      { userId: member, circleId: circle.id },
      { userId: peer, circleId: circle.id },
    ],
  });
  const session = await db.session.create({
    data: {
      id: randomUUID(),
      userId: member,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  return {
    owner,
    member,
    peer,
    outsider,
    circleId: circle.id,
    sessionId: session.id,
  };
}
async function task(
  userId: string,
  circleId: string,
  status: "OPEN" | "VERIFIED" | "MISSED" | "AWAITING_REVIEW" = "OPEN",
) {
  return db.commitment.create({
    data: {
      userId,
      circleId,
      title: "Keep the promise",
      day: new Date(),
      dueAt: new Date(Date.now() + 86400_000),
      status,
      requiredApprovals: 2,
    },
  });
}
async function media(ownerId: string, circleId: string) {
  const id = `i_${randomUUID()}`;
  return db.mediaUpload.create({
    data: {
      id,
      ownerId,
      circleId,
      objectKey: `media/${id}/photo`,
      mimeType: "image/webp",
      sizeBytes: 100,
      ready: true,
      claimed: true,
    },
  });
}
async function proof(userId: string, circleId: string, commitmentId: string) {
  const upload = await media(userId, circleId);
  return db.taskProof.create({
    data: {
      ownerId: userId,
      circleId,
      commitmentId,
      startedAt: new Date(),
      completedAt: new Date(),
      isLate: false,
      mediaIds: [upload.id],
    },
  });
}

test("goal deletion checks author and membership and unlinks rather than deletes tasks", async () => {
  const f = await fixture();
  const goal = await db.goal.create({
    data: {
      userId: f.member,
      circleId: f.circleId,
      title: "Goal",
      milestones: { create: { title: "Step", position: 0 } },
    },
  });
  const linked = await task(f.member, f.circleId);
  await db.commitment.update({
    where: { id: linked.id },
    data: { goalId: goal.id },
  });
  for (const user of [f.owner, f.peer, f.outsider])
    await expect(
      deleteContent("goal", goal.id, user, f.circleId),
    ).rejects.toThrow();
  await expect(
    deleteContent("goal", goal.id, f.member, "wrong-circle"),
  ).rejects.toThrow();
  await deleteContent("goal", goal.id, f.member, f.circleId);
  expect(await db.goal.findUnique({ where: { id: goal.id } })).toBeNull();
  expect(
    (await db.commitment.findUniqueOrThrow({ where: { id: linked.id } }))
      .goalId,
  ).toBeNull();
  expect(await db.goalMilestone.count({ where: { goalId: goal.id } })).toBe(0);
});

test("old replies can be deleted only by their author, including attachments", async () => {
  const f = await fixture();
  const t = await task(f.member, f.circleId);
  const file = await media(f.member, f.circleId);
  const reply = await db.socialReply.create({
    data: {
      authorId: f.member,
      circleId: f.circleId,
      commitmentId: t.id,
      body: "Old private words",
      createdAt: new Date("2020-01-01"),
      mediaIds: [file.id],
    },
  });
  await expect(
    deleteSocialReply(reply.id, f.peer, f.circleId),
  ).rejects.toThrow();
  await deleteSocialReply(reply.id, f.member, f.circleId);
  expect(
    await db.socialReply.findUnique({ where: { id: reply.id } }),
  ).toBeNull();
  expect(
    await db.mediaUpload.findUnique({ where: { id: file.id } }),
  ).toBeNull();
  expect(
    await db.objectDeletion.findUnique({ where: { key: file.objectKey } }),
  ).not.toBeNull();
});

test("cancellation keeps a visible record, stops pending publication, and cannot erase missed or verified results", async () => {
  const f = await fixture();
  const t = await task(f.member, f.circleId);
  const file = await media(f.member, f.circleId);
  await db.pendingProof.create({
    data: {
      ownerId: f.member,
      circleId: f.circleId,
      commitmentId: t.id,
      mediaIds: [file.id],
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  await expect(
    deleteContent("task", t.id, f.peer, f.circleId),
  ).rejects.toThrow();
  await deleteContent("task", t.id, f.member, f.circleId);
  expect(
    (await db.commitment.findUniqueOrThrow({ where: { id: t.id } })).status,
  ).toBe("CANCELLED");
  expect(await db.pendingProof.count({ where: { commitmentId: t.id } })).toBe(
    0,
  );
  expect(canSubmitProof({ ...t, status: "CANCELLED" })).toBe(false);
  await expect(
    updateCommitment(t.id, f.member, f.circleId, {
      title: "Reopen it",
      circleId: f.circleId,
    }),
  ).rejects.toThrow();
  await expect(
    submitProof(t.id, f.member, f.circleId, [], "", new Date(), new Date()),
  ).rejects.toThrow();
  for (const status of ["VERIFIED", "MISSED"] as const) {
    const finished = await task(f.member, f.circleId, status);
    await expect(
      deleteContent("task", finished.id, f.member, f.circleId),
    ).rejects.toThrow();
    expect(
      (await db.commitment.findUniqueOrThrow({ where: { id: finished.id } }))
        .status,
    ).toBe(status);
  }
  const expired = await task(f.member, f.circleId);
  await db.commitment.update({
    where: { id: expired.id },
    data: { dueAt: new Date(0) },
  });
  await expect(
    deleteContent("task", expired.id, f.member, f.circleId),
  ).rejects.toThrow("deadline");
});

test("removing proof erases all versions and discussion files while preserving verified results", async () => {
  const f = await fixture();
  const t = await task(f.member, f.circleId, "VERIFIED");
  const old = await proof(f.member, f.circleId, t.id);
  const current = await proof(f.member, f.circleId, t.id);
  await db.taskProof.update({
    where: { id: old.id },
    data: { replacedById: current.id },
  });
  const file = await media(f.peer, f.circleId);
  await db.socialReply.create({
    data: {
      authorId: f.peer,
      circleId: f.circleId,
      proofId: current.id,
      body: "Reply",
      mediaIds: [file.id],
    },
  });
  await expect(
    deleteContent("proof", current.id, f.owner, f.circleId),
  ).rejects.toThrow();
  await deleteContent("proof", current.id, f.member, f.circleId);
  expect(await db.taskProof.count({ where: { commitmentId: t.id } })).toBe(0);
  expect(
    (await db.commitment.findUniqueOrThrow({ where: { id: t.id } })).status,
  ).toBe("VERIFIED");
  expect(
    await db.mediaUpload.findUnique({ where: { id: file.id } }),
  ).toBeNull();
  const open = await task(f.member, f.circleId, "AWAITING_REVIEW");
  const pending = await proof(f.member, f.circleId, open.id);
  await deleteContent("proof", pending.id, f.member, f.circleId);
  expect(
    (await db.commitment.findUniqueOrThrow({ where: { id: open.id } })).status,
  ).toBe("OPEN");
});

test("deleting the latest check-in restores the earlier daily signal and eventually removes the parent", async () => {
  const f = await fixture();
  const parent = await db.checkIn.create({
    data: {
      userId: f.member,
      circleId: f.circleId,
      day: new Date(),
      signal: "NAY",
    },
  });
  const earlier = await db.checkInUpdate.create({
    data: {
      checkInId: parent.id,
      userId: f.member,
      circleId: f.circleId,
      day: new Date(),
      signal: "YAY",
      createdAt: new Date(0),
    },
  });
  const latest = await db.checkInUpdate.create({
    data: {
      checkInId: parent.id,
      userId: f.member,
      circleId: f.circleId,
      day: new Date(),
      signal: "NAY",
    },
  });
  await deleteContent("check-in", latest.id, f.member, f.circleId);
  expect(
    (await db.checkIn.findUniqueOrThrow({ where: { id: parent.id } })).signal,
  ).toBe("YAY");
  await deleteContent("check-in", earlier.id, f.member, f.circleId);
  expect(await db.checkIn.findUnique({ where: { id: parent.id } })).toBeNull();
});

test("screen-time deletion removes earlier reads and screenshots for that week only", async () => {
  const f = await fixture();
  const weekStart = new Date("2026-10-05");
  const files = await Promise.all([
    media(f.member, f.circleId),
    media(f.member, f.circleId),
  ]);
  const reads = await Promise.all(
    files.map((file) =>
      db.screenTimeReading.create({
        data: {
          userId: f.member,
          circleId: f.circleId,
          weekStart,
          mediaId: file.id,
          dailyAverageMinutes: 100,
        },
      }),
    ),
  );
  const submission = await db.screenTimeSubmission.create({
    data: {
      userId: f.member,
      circleId: f.circleId,
      weekStart,
      readingId: reads[1].id,
    },
  });
  await deleteContent("screen-time", submission.id, f.member, f.circleId);
  expect(
    await db.screenTimeReading.count({ where: { userId: f.member } }),
  ).toBe(0);
  expect(
    await db.mediaUpload.count({
      where: { id: { in: files.map((file) => file.id) } },
    }),
  ).toBe(0);
});

test("shared ideas can be permanently deleted by proposer or owner, never peers or outsiders", async () => {
  const f = await fixture();
  for (const actor of [f.member, f.owner]) {
    const item = await db.bucketItem.create({
      data: {
        proposerId: f.member,
        circleId: f.circleId,
        title: "Trip",
        status: "COMPLETED",
      },
    });
    await expect(
      deleteContent("bucket-item", item.id, f.peer, f.circleId),
    ).rejects.toThrow();
    await expect(
      deleteContent("bucket-item", item.id, f.outsider, f.circleId),
    ).rejects.toThrow();
    await deleteContent("bucket-item", item.id, actor, f.circleId);
    expect(
      await db.bucketItem.findUnique({ where: { id: item.id } }),
    ).toBeNull();
  }
});

test("leaving preserves history and frozen thresholds; owners must transfer or delete", async () => {
  const f = await fixture();
  const t = await task(f.member, f.circleId);
  await expect(
    changeCircleLifecycle(f.owner, f.circleId, "leave"),
  ).rejects.toThrow();
  await changeCircleLifecycle(f.member, f.circleId, "leave");
  expect(
    (await db.commitment.findUniqueOrThrow({ where: { id: t.id } }))
      .requiredApprovals,
  ).toBe(2);
  await expect(
    deleteContent("task", t.id, f.member, f.circleId),
  ).rejects.toThrow();
});

test("ownership transfer is atomic, targets current members, and revokes former owner permissions", async () => {
  const f = await fixture();
  await expect(
    changeCircleLifecycle(f.member, f.circleId, "transfer", undefined, f.peer),
  ).rejects.toThrow();
  await expect(
    changeCircleLifecycle(
      f.owner,
      f.circleId,
      "transfer",
      undefined,
      f.outsider,
    ),
  ).rejects.toThrow();
  await changeCircleLifecycle(
    f.owner,
    f.circleId,
    "transfer",
    undefined,
    f.member,
  );
  await expect(
    removeCircleMember(f.peer, f.circleId, f.owner),
  ).rejects.toThrow();
  await expect(
    changeCircleLifecycle(f.owner, f.circleId, "delete", "Deletion test"),
  ).rejects.toThrow();
  expect(
    (
      await db.membership.findUniqueOrThrow({
        where: { userId_circleId: { userId: f.member, circleId: f.circleId } },
      })
    ).role,
  ).toBe("OWNER");
  await changeCircleLifecycle(f.owner, f.circleId, "leave");
});

test("circle deletion checks typed name and preserves members, other circles, and files there", async () => {
  const f = await fixture();
  const other = await db.circle.create({
    data: { name: "Other", slug: randomUUID() },
  });
  const local = await media(f.member, f.circleId);
  const unrelated = await media(f.member, other.id);
  await expect(
    changeCircleLifecycle(f.owner, f.circleId, "delete", "wrong"),
  ).rejects.toThrow();
  await expect(
    changeCircleLifecycle(f.member, f.circleId, "delete", "Deletion test"),
  ).rejects.toThrow();
  await changeCircleLifecycle(f.owner, f.circleId, "delete", "Deletion test");
  expect(await db.circle.findUnique({ where: { id: f.circleId } })).toBeNull();
  expect(await db.user.findUnique({ where: { id: f.member } })).not.toBeNull();
  expect(
    await db.mediaUpload.findUnique({ where: { id: unrelated.id } }),
  ).not.toBeNull();
  expect(
    await db.objectDeletion.findUnique({ where: { key: local.objectKey } }),
  ).not.toBeNull();
});

test("account deletion requires confirmation, a fresh live session, and resolved ownership", async () => {
  const f = await fixture();
  await expect(deleteOwnAccount(f.member, f.sessionId, "no")).rejects.toThrow();
  await expect(
    deleteOwnAccount(f.peer, f.sessionId, "DELETE"),
  ).rejects.toThrow();
  await expect(
    deleteOwnAccount(
      f.member,
      f.sessionId,
      "DELETE",
      new Date(Date.now() + 11 * 60_000),
    ),
  ).rejects.toThrow("Sign in again");
  await changeCircleLifecycle(
    f.owner,
    f.circleId,
    "transfer",
    undefined,
    f.member,
  );
  await expect(
    deleteOwnAccount(f.member, f.sessionId, "DELETE"),
  ).rejects.toThrow("Transfer ownership");
  expect(await db.user.findUnique({ where: { id: f.member } })).not.toBeNull();
});

test("account deletion preserves shared plans, other people's approvals and replies, while erasing personal data and sessions", async () => {
  const f = await fixture();
  const mine = await task(f.member, f.circleId);
  const theirs = await task(f.peer, f.circleId, "AWAITING_REVIEW");
  const evidence = await proof(f.peer, f.circleId, theirs.id);
  const review = await db.taskProofReview.create({
    data: {
      reviewerId: f.member,
      circleId: f.circleId,
      proofId: evidence.id,
      decision: "APPROVED",
      note: "Personal review",
    },
  });
  const reviewReply = await db.socialReply.create({
    data: {
      authorId: f.peer,
      circleId: f.circleId,
      reviewId: review.id,
      body: "Keep this discussion",
    },
  });
  const item = await db.bucketItem.create({
    data: {
      proposerId: f.member,
      circleId: f.circleId,
      title: "Shared plan",
      completionParticipantIds: [f.member, f.peer],
    },
  });
  await db.bucketVote.create({
    data: { itemId: item.id, userId: f.peer, stage: "PROPOSAL", inFavor: true },
  });
  const ownFile = await media(f.member, f.circleId);
  await db.pendingProof.create({
    data: {
      ownerId: f.member,
      circleId: f.circleId,
      commitmentId: mine.id,
      mediaIds: [ownFile.id],
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  const chat = await db.timeblockChat.create({ data: { userId: f.member } });
  const attachment = await db.timeblockChatAttachment.create({
    data: {
      chatId: chat.id,
      objectKey: `chat/${chat.id}/private`,
      filename: "private.txt",
      mediaType: "text/plain",
      sizeBytes: 1,
    },
  });
  await deleteOwnAccount(f.member, f.sessionId, "DELETE");
  expect(await db.user.findUnique({ where: { id: f.member } })).toBeNull();
  expect(await db.session.count({ where: { userId: f.member } })).toBe(0);
  expect(await db.pendingProof.count({ where: { ownerId: f.member } })).toBe(0);
  expect(await db.mediaUpload.count({ where: { ownerId: f.member } })).toBe(0);
  expect(
    await db.objectDeletion.findUnique({
      where: { key: attachment.objectKey },
    }),
  ).not.toBeNull();
  expect(
    await db.objectDeletion.findUnique({
      where: { key: `timeblock-chat/${chat.id}/` },
    }),
  ).not.toBeNull();
  expect(
    (await db.bucketItem.findUniqueOrThrow({ where: { id: item.id } }))
      .proposerId,
  ).toBeNull();
  expect(
    await db.bucketVote.count({ where: { itemId: item.id, userId: f.peer } }),
  ).toBe(1);
  const keptReview = await db.taskProofReview.findUniqueOrThrow({
    where: { id: review.id },
  });
  expect(keptReview.reviewerId).toBeNull();
  expect(keptReview.note).toBeNull();
  expect(
    proofApprovalProgress(
      f.peer,
      [f.owner, f.peer],
      [
        keptReview,
        {
          id: "another-deleted-review",
          reviewerId: null,
          decision: "APPROVED",
        },
      ],
      2,
    ).approvalCount,
  ).toBe(2);
  expect(
    await db.socialReply.findUnique({ where: { id: reviewReply.id } }),
  ).not.toBeNull();
  expect(
    (await db.commitment.findUniqueOrThrow({ where: { id: theirs.id } }))
      .requiredApprovals,
  ).toBe(2);
});

test("concurrent transfers cannot leave multiple successors or restore the former owner", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    changeCircleLifecycle(f.owner, f.circleId, "transfer", undefined, f.member),
    changeCircleLifecycle(f.owner, f.circleId, "transfer", undefined, f.peer),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    await db.membership.count({
      where: { circleId: f.circleId, role: "OWNER" },
    }),
  ).toBe(1);
  expect(
    (
      await db.membership.findUniqueOrThrow({
        where: { userId_circleId: { userId: f.owner, circleId: f.circleId } },
      })
    ).role,
  ).toBe("MEMBER");
});

test("proof removal cancels an in-flight replacement and does not unlock title editing", async () => {
  const f = await fixture();
  const t = await task(f.member, f.circleId, "AWAITING_REVIEW");
  await db.commitment.update({
    where: { id: t.id },
    data: { proofSubmittedAt: new Date() },
  });
  const posted = await proof(f.member, f.circleId, t.id);
  const pendingMedia = await media(f.member, f.circleId);
  await db.pendingProof.create({
    data: {
      ownerId: f.member,
      circleId: f.circleId,
      commitmentId: t.id,
      mediaIds: [pendingMedia.id],
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  await deleteContent("proof", posted.id, f.member, f.circleId);
  expect(await db.pendingProof.count({ where: { commitmentId: t.id } })).toBe(
    0,
  );
  expect(
    await db.mediaUpload.findUnique({ where: { id: pendingMedia.id } }),
  ).toBeNull();
  await expect(
    updateCommitment(t.id, f.member, f.circleId, {
      title: "Different promise",
      circleId: f.circleId,
    }),
  ).rejects.toThrow();
});

test("file cleanup retries storage failures and removes late writes before retiring its durable job", async () => {
  const key = `cleanup/${randomUUID()}`;
  let fail = true;
  let deleted = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (fail)
        return new Response("<Error><Code>AccessDenied</Code></Error>", {
          status: 403,
          headers: { "content-type": "application/xml" },
        });
      if (request.method === "DELETE") deleted++;
      return new Response(null, { status: 204 });
    },
  });
  const previous = process.env.PB_TEST_R2_ENDPOINT;
  process.env.PB_TEST_R2_ENDPOINT = `http://127.0.0.1:${server.port}`;
  try {
    await db.objectDeletion.updateMany({
      data: { nextAttemptAt: new Date(Date.now() + 10 * 86400_000) },
    });
    await db.$transaction((tx) => queueObjectDeletion(tx, key));
    const now = new Date();
    expect((await drainObjectDeletions(now)).failed).toBe(1);
    expect(
      await db.objectDeletion.findUnique({ where: { key } }),
    ).not.toBeNull();
    fail = false;
    await drainObjectDeletions(new Date(now.getTime() + 3600_000));
    expect(deleted).toBe(1);
    expect(
      await db.objectDeletion.findUnique({ where: { key } }),
    ).not.toBeNull();
    await drainObjectDeletions(new Date(now.getTime() + 4 * 86400_000));
    expect(deleted).toBe(2);
    expect(await db.objectDeletion.findUnique({ where: { key } })).toBeNull();
  } finally {
    process.env.PB_TEST_R2_ENDPOINT = previous;
    server.stop(true);
  }
});
test("cleanup aborts multipart uploads and sweeps only the deleted media prefix, including late results", async () => {
  const id = randomUUID();
  const prefix = `media/${id}/`;
  const staging = `staging/${id}`;
  const objects = new Set([
    `${prefix}video.mp4`,
    `${prefix}poster.webp`,
    staging,
    "unrelated/keep",
  ]);
  let aborted = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (request.method === "DELETE" && url.searchParams.has("uploadId")) {
        aborted++;
        return new Response(null, { status: 204 });
      }
      if (request.method === "DELETE") {
        objects.delete(
          decodeURIComponent(url.pathname.split("/").slice(2).join("/")),
        );
        return new Response(null, { status: 204 });
      }
      const requested = url.searchParams.get("prefix") ?? "";
      return new Response(
        `<ListBucketResult><IsTruncated>false</IsTruncated>${[...objects]
          .filter((key) => key.startsWith(requested))
          .map((key) => `<Contents><Key>${key}</Key></Contents>`)
          .join("")}</ListBucketResult>`,
        { headers: { "content-type": "application/xml" } },
      );
    },
  });
  const previous = process.env.PB_TEST_R2_ENDPOINT;
  process.env.PB_TEST_R2_ENDPOINT = `http://127.0.0.1:${server.port}`;
  try {
    await db.objectDeletion.updateMany({
      data: { nextAttemptAt: new Date(Date.now() + 10 * 86400_000) },
    });
    await db.$transaction(async (tx) => {
      await queueObjectDeletion(tx, prefix, true);
      await queueObjectDeletion(tx, staging, false, "multipart-id");
    });
    const now = new Date();
    expect((await drainObjectDeletions(now)).failed).toBe(0);
    expect(aborted).toBe(1);
    expect([...objects]).toEqual(["unrelated/keep"]);
    objects.add(`${prefix}late-encoder-output`);
    expect(
      (await drainObjectDeletions(new Date(now.getTime() + 3600_000))).failed,
    ).toBe(0);
    expect([...objects]).toEqual(["unrelated/keep"]);
  } finally {
    process.env.PB_TEST_R2_ENDPOINT = previous;
    server.stop(true);
  }
});
afterAll(async () => {
  await db.$disconnect();
});
