import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const challengeOnly = "20261006050642_challenge_only_proofs";
const target = "20261008041715_restore_approvals";
const directory = new URL("../prisma/migrations/", import.meta.url);
const migrations = readdirSync(directory)
  .filter((name) => /^\d/.test(name))
  .sort();
const sql = (name: string) =>
  readFileSync(new URL(`${name}/migration.sql`, directory), "utf8");

test("restoring approvals rebuilds converted approvals and keeps a day of challenge-only activity", async () => {
  const db = new PGlite();
  try {
    for (const name of migrations.slice(0, migrations.indexOf(challengeOnly)))
      await db.exec(sql(name));
    // Approval-era data, as it stood before approvals were removed.
    await db.exec(`
      INSERT INTO "User" (id, email, name, "updatedAt") VALUES
        ('owner', 'owner@example.invalid', 'Owner', now()),
        ('a', 'a@example.invalid', 'Ana', now()),
        ('b', 'b@example.invalid', 'Ben', now());
      INSERT INTO "Circle" (id, slug, name, "updatedAt") VALUES ('c', 'c', 'Circle', now());
      INSERT INTO "Membership" ("userId", "circleId") VALUES ('owner', 'c'), ('a', 'c'), ('b', 'c');
      INSERT INTO "Commitment" (id, "userId", "circleId", day, title, "dueAt", status, "proofSubmittedAt", "requiredApprovals", "updatedAt") VALUES
        ('waiting', 'owner', 'c', '2026-10-01', 'Waiting', '2026-10-02', 'AWAITING_REVIEW', '2026-10-01', 2, now()),
        ('verified', 'owner', 'c', '2026-10-01', 'Verified', '2026-10-02', 'VERIFIED', '2026-10-01', 1, now()),
        ('challenged', 'owner', 'c', '2026-10-01', 'Challenged', '2026-10-02', 'OPEN', '2026-10-01', 1, now()),
        ('conflict', 'owner', 'c', '2026-10-05', 'Conflict', '2026-10-06', 'AWAITING_REVIEW', '2026-10-05', 1, now()),
        ('missed', 'owner', 'c', '2026-10-01', 'Missed', '2026-10-02', 'MISSED', NULL, 1, now());
      INSERT INTO "TaskProof" (id, "commitmentId", "ownerId", "circleId", "startedAt", "completedAt", "isLate", "reviewStatus", "submittedAt") VALUES
        ('p-waiting', 'waiting', 'owner', 'c', '2026-10-01', '2026-10-01', false, 'PENDING', '2026-10-01'),
        ('p-verified', 'verified', 'owner', 'c', '2026-10-01', '2026-10-01', false, 'APPROVED', '2026-10-01'),
        ('p-challenged', 'challenged', 'owner', 'c', '2026-10-01', '2026-10-01', false, 'CHALLENGED', '2026-10-01'),
        ('p-conflict', 'conflict', 'owner', 'c', '2026-10-05', '2026-10-05', false, 'PENDING', '2026-10-05');
      INSERT INTO "TaskProofReview" (id, "proofId", "reviewerId", "circleId", decision, note, "createdAt") VALUES
        ('r-ana', 'p-waiting', 'a', 'c', 'APPROVED', 'Nice work', '2026-10-01 03:00'),
        ('r-ben', 'p-waiting', 'b', 'c', 'APPROVED', NULL, '2026-10-01 04:00'),
        ('r-verified', 'p-verified', 'b', 'c', 'APPROVED', NULL, '2026-10-01 03:00'),
        ('r-challenge', 'p-challenged', 'b', 'c', 'CHALLENGED', 'Blurry', '2026-10-01 05:00'),
        ('r-conflict', 'p-conflict', 'a', 'c', 'APPROVED', 'Looks fine', '2026-10-05 03:00');
      INSERT INTO "PostLike" (id, "userId", "circleId", "proofId", "reviewId") VALUES
        ('like-proof', 'a', 'c', 'p-waiting', NULL),
        ('like-approval', 'owner', 'c', NULL, 'r-ana'),
        ('like-challenge', 'a', 'c', NULL, 'r-challenge');
      INSERT INTO "SocialReply" (id, "authorId", "circleId", "proofId", "reviewId", body, "updatedAt") VALUES
        ('reply-approval', 'owner', 'c', NULL, 'r-ana', 'Thanks!', now()),
        ('reply-proof', 'b', 'c', 'p-waiting', NULL, 'Cool', now());
    `);

    await db.exec(sql(challengeOnly));

    // A day without approvals: new proof counts as done, Ana challenges the
    // proof she had approved, and Ben likes the new post.
    await db.exec(`
      INSERT INTO "Commitment" (id, "userId", "circleId", day, title, "dueAt", status, "proofSubmittedAt", "updatedAt") VALUES
        ('day', 'owner', 'c', '2026-10-06', 'Day', '2026-10-07', 'DONE', '2026-10-06', now());
      INSERT INTO "TaskProof" (id, "commitmentId", "ownerId", "circleId", "startedAt", "completedAt", "isLate", "submittedAt") VALUES
        ('p-day', 'day', 'owner', 'c', '2026-10-06', '2026-10-06', false, '2026-10-06');
      INSERT INTO "PostLike" (id, "userId", "circleId", "proofId") VALUES ('like-day', 'b', 'c', 'p-day');
      INSERT INTO "ProofChallenge" (id, "proofId", "challengerId", "circleId", reason, "createdAt") VALUES
        ('c-day', 'p-conflict', 'a', 'c', 'Actually, the last page is missing', '2026-10-06 01:00');
      UPDATE "Commitment" SET status = 'OPEN' WHERE id = 'conflict';
    `);

    await db.exec(sql(target));

    const rows = async <T>(query: string) => (await db.query<T>(query)).rows;
    expect(
      await rows(
        `SELECT id, status::text, "requiredApprovals" FROM "Commitment" ORDER BY id`,
      ),
    ).toEqual([
      { id: "challenged", status: "OPEN", requiredApprovals: 1 },
      { id: "conflict", status: "OPEN", requiredApprovals: 1 },
      { id: "day", status: "VERIFIED", requiredApprovals: 1 },
      { id: "missed", status: "MISSED", requiredApprovals: 1 },
      { id: "verified", status: "VERIFIED", requiredApprovals: 1 },
      { id: "waiting", status: "VERIFIED", requiredApprovals: 1 },
    ]);
    expect(
      await rows(
        `SELECT id, "reviewStatus"::text AS status FROM "TaskProof" ORDER BY id`,
      ),
    ).toEqual([
      { id: "p-challenged", status: "CHALLENGED" },
      { id: "p-conflict", status: "CHALLENGED" },
      { id: "p-day", status: "APPROVED" },
      { id: "p-verified", status: "APPROVED" },
      { id: "p-waiting", status: "APPROVED" },
    ]);

    // Ben's note-less approval of p-waiting collided with nothing, so it
    // returns. Ana's approval of p-conflict loses to her later challenge.
    expect(
      await rows(
        `SELECT id, "proofId", "reviewerId", decision::text, note, "createdAt" = '2026-10-01 03:00' AS "keptTime" FROM "TaskProofReview" ORDER BY id`,
      ),
    ).toEqual([
      {
        id: "c-day",
        proofId: "p-conflict",
        reviewerId: "a",
        decision: "CHALLENGED",
        note: "Actually, the last page is missing",
        keptTime: false,
      },
      {
        id: "r-ana",
        proofId: "p-waiting",
        reviewerId: "a",
        decision: "APPROVED",
        note: "Nice work",
        keptTime: true,
      },
      {
        id: "r-ben",
        proofId: "p-waiting",
        reviewerId: "b",
        decision: "APPROVED",
        note: null,
        keptTime: false,
      },
      {
        id: "r-challenge",
        proofId: "p-challenged",
        reviewerId: "b",
        decision: "CHALLENGED",
        note: "Blurry",
        keptTime: false,
      },
      {
        id: "r-verified",
        proofId: "p-verified",
        reviewerId: "b",
        decision: "APPROVED",
        note: null,
        keptTime: true,
      },
    ]);

    expect(
      await rows(
        `SELECT id, "userId", "proofId", "replyId", "reviewId" FROM "PostLike" ORDER BY id`,
      ),
    ).toEqual([
      {
        id: "approval_r-conflict",
        userId: "a",
        proofId: "p-conflict",
        replyId: null,
        reviewId: null,
      },
      {
        id: "like-approval",
        userId: "owner",
        proofId: null,
        replyId: null,
        reviewId: "r-ana",
      },
      {
        id: "like-challenge",
        userId: "a",
        proofId: null,
        replyId: null,
        reviewId: "r-challenge",
      },
      {
        id: "like-day",
        userId: "b",
        proofId: "p-day",
        replyId: null,
        reviewId: null,
      },
      {
        id: "like-proof",
        userId: "a",
        proofId: "p-waiting",
        replyId: null,
        reviewId: null,
      },
    ]);
    expect(
      await rows(
        `SELECT id, "proofId", "reviewId", body FROM "SocialReply" ORDER BY id`,
      ),
    ).toEqual([
      {
        id: "approval_r-conflict",
        proofId: "p-conflict",
        reviewId: null,
        body: "Looks fine",
      },
      {
        id: "reply-approval",
        proofId: "p-waiting",
        reviewId: null,
        body: "Thanks!",
      },
      { id: "reply-proof", proofId: "p-waiting", reviewId: null, body: "Cool" },
    ]);

    // One review per person and proof, and one target per like or comment.
    await expect(
      db.exec(
        `INSERT INTO "TaskProofReview" (id, "proofId", "reviewerId", "circleId", decision) VALUES ('again', 'p-waiting', 'a', 'c', 'APPROVED')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `INSERT INTO "SocialReply" (id, "authorId", "circleId", "proofId", "reviewId", body, "updatedAt") VALUES ('two', 'b', 'c', 'p-day', 'r-ana', 'x', now())`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `INSERT INTO "PostLike" (id, "userId", "circleId", "proofId", "reviewId") VALUES ('two', 'b', 'c', 'p-verified', 'r-ana')`,
      ),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
});
