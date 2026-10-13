import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const target = "20261006050642_challenge_only_proofs";
const directory = new URL("../prisma/migrations/", import.meta.url);
const migrations = readdirSync(directory)
  .filter((name) => /^\d/.test(name))
  .sort();
const sql = (name: string) =>
  readFileSync(new URL(`${name}/migration.sql`, directory), "utf8");

test("challenge-only migration keeps proof history, approvals, and comments", async () => {
  const db = new PGlite();
  try {
    for (const name of migrations.slice(0, migrations.indexOf(target)))
      await db.exec(sql(name));
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
        ('replaced', 'owner', 'c', '2026-10-01', 'Replaced', '2026-10-02', 'AWAITING_REVIEW', '2026-10-01', 1, now()),
        ('missed', 'owner', 'c', '2026-10-01', 'Missed', '2026-10-02', 'MISSED', NULL, 1, now()),
        ('open', 'owner', 'c', '2026-10-05', 'Open', '2026-10-06', 'RENEGOTIATED', NULL, 1, now());
      INSERT INTO "TaskProof" (id, "commitmentId", "ownerId", "circleId", "startedAt", "completedAt", "isLate", "reviewStatus", "submittedAt", "replacedById") VALUES
        ('p-waiting', 'waiting', 'owner', 'c', '2026-10-01', '2026-10-01', false, 'PENDING', '2026-10-01', NULL),
        ('p-verified', 'verified', 'owner', 'c', '2026-10-01', '2026-10-01', false, 'APPROVED', '2026-10-01', NULL),
        ('p-challenged', 'challenged', 'owner', 'c', '2026-10-01', '2026-10-01', false, 'CHALLENGED', '2026-10-01', NULL),
        ('p-new', 'replaced', 'owner', 'c', '2026-10-01', '2026-10-01', false, 'PENDING', '2026-10-01 02:00', NULL),
        ('p-old', 'replaced', 'owner', 'c', '2026-10-01', '2026-10-01', false, 'CHALLENGED', '2026-10-01 01:00', 'p-new');
      INSERT INTO "TaskProofReview" (id, "proofId", "reviewerId", "circleId", decision, note, "createdAt") VALUES
        ('r-ana', 'p-waiting', 'a', 'c', 'APPROVED', '  Nice work  ', '2026-10-01 03:00'),
        ('r-ben', 'p-waiting', 'b', 'c', 'APPROVED', NULL, '2026-10-01 04:00'),
        ('r-verified', 'p-verified', 'a', 'c', 'APPROVED', '', '2026-10-01 03:00'),
        ('r-challenge', 'p-challenged', 'b', 'c', 'CHALLENGED', 'Blurry', '2026-10-01 05:00'),
        ('r-old', 'p-old', 'a', 'c', 'CHALLENGED', NULL, '2026-10-01 01:30');
      INSERT INTO "PostLike" (id, "userId", "circleId", "proofId", "reviewId") VALUES
        ('like-proof', 'a', 'c', 'p-waiting', NULL),
        ('like-approval', 'owner', 'c', NULL, 'r-ana'),
        ('like-empty-approval', 'owner', 'c', NULL, 'r-ben'),
        ('like-challenge', 'a', 'c', NULL, 'r-challenge');
      INSERT INTO "SocialReply" (id, "authorId", "circleId", "proofId", "reviewId", body, "updatedAt") VALUES
        ('reply-approval', 'owner', 'c', NULL, 'r-ana', 'Thanks!', now()),
        ('reply-challenge', 'owner', 'c', NULL, 'r-challenge', 'Fair', now()),
        ('reply-proof', 'b', 'c', 'p-waiting', NULL, 'Cool', now());
      INSERT INTO "CheckIn" (id, "userId", "circleId", day, signal, "updatedAt") VALUES ('ci', 'owner', 'c', '2026-10-01', 'YAY', now());
      INSERT INTO "CheckInUpdate" (id, "checkInId", "userId", "circleId", day, signal, mood, valence) VALUES
        ('mood-only', 'ci', 'owner', 'c', '2026-10-01', 'YAY', 4, NULL),
        ('both', 'ci', 'owner', 'c', '2026-10-01', 'NAY', 2, 40),
        ('plain', 'ci', 'owner', 'c', '2026-10-01', 'YAY', NULL, NULL);
      INSERT INTO "NotificationPreference" ("userId", "proofsSubmitted", "streakMorningHour", "updatedAt") VALUES ('a', false, 7, now());
    `);

    await db.exec(sql(target));

    const rows = async <T>(query: string) => (await db.query<T>(query)).rows;
    const status = Object.fromEntries(
      (
        await rows<{ id: string; status: string }>(
          `SELECT id, status::text FROM "Commitment"`,
        )
      ).map((row) => [row.id, row.status]),
    );
    expect(status).toEqual({
      waiting: "DONE",
      verified: "DONE",
      challenged: "OPEN",
      replaced: "DONE",
      missed: "MISSED",
      open: "RENEGOTIATED",
    });

    expect(
      await rows(
        `SELECT id, "proofId", "challengerId", reason FROM "ProofChallenge" ORDER BY id`,
      ),
    ).toEqual([
      {
        id: "r-challenge",
        proofId: "p-challenged",
        challengerId: "b",
        reason: "Blurry",
      },
      { id: "r-old", proofId: "p-old", challengerId: "a", reason: "" },
    ]);

    expect(
      await rows(
        `SELECT "userId", "proofId", "replyId", "challengeId" FROM "PostLike" ORDER BY "userId", "proofId", "replyId", "challengeId"`,
      ),
    ).toEqual([
      { userId: "a", proofId: "p-verified", replyId: null, challengeId: null },
      { userId: "a", proofId: "p-waiting", replyId: null, challengeId: null },
      {
        userId: "a",
        proofId: null,
        replyId: null,
        challengeId: "r-challenge",
      },
      { userId: "b", proofId: "p-waiting", replyId: null, challengeId: null },
      {
        userId: "owner",
        proofId: null,
        replyId: "approval_r-ana",
        challengeId: null,
      },
    ]);

    expect(
      await rows(
        `SELECT id, "authorId", "proofId", body, "createdAt" = '2026-10-01 03:00' AS "keptTime" FROM "SocialReply" ORDER BY id`,
      ),
    ).toEqual([
      {
        id: "approval_r-ana",
        authorId: "a",
        proofId: "p-waiting",
        body: "Nice work",
        keptTime: true,
      },
      {
        id: "reply-approval",
        authorId: "owner",
        proofId: "p-waiting",
        body: "Thanks!",
        keptTime: false,
      },
      {
        id: "reply-challenge",
        authorId: "owner",
        proofId: "p-challenged",
        body: "Fair",
        keptTime: false,
      },
      {
        id: "reply-proof",
        authorId: "b",
        proofId: "p-waiting",
        body: "Cool",
        keptTime: false,
      },
    ]);

    expect(
      await rows(
        `SELECT id, valence, signal::text FROM "CheckInUpdate" ORDER BY id`,
      ),
    ).toEqual([
      { id: "both", valence: 40, signal: "NAY" },
      { id: "mood-only", valence: 57, signal: "YAY" },
      { id: "plain", valence: null, signal: "YAY" },
    ]);
    expect(
      await rows(
        `SELECT "userId", "proofsSubmitted", "streakMorningHour" FROM "NotificationPreference"`,
      ),
    ).toEqual([{ userId: "a", proofsSubmitted: false, streakMorningHour: 7 }]);
    expect(
      (
        await rows<{ count: number }>(`SELECT count(*)::int FROM "TaskProof"`)
      )[0].count,
    ).toBe(5);

    // One challenge per proof, and every like or comment still has one target.
    await expect(
      db.exec(
        `INSERT INTO "ProofChallenge" (id, "proofId", "challengerId", "circleId", reason) VALUES ('again', 'p-challenged', 'a', 'c', 'x')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `INSERT INTO "PostLike" (id, "userId", "circleId", "proofId", "challengeId") VALUES ('two', 'b', 'c', 'p-verified', 'r-challenge')`,
      ),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
});
