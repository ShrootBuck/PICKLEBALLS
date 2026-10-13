import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260922030000_reconcile_half_circle_approvals/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

test("threshold migration repairs existing verdicts without reviving invalid proofs", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Membership" ("userId" text, "circleId" text);
      CREATE TABLE "Commitment" (
        "id" text PRIMARY KEY, "status" text, "dueAt" timestamp,
        "updatedAt" timestamp DEFAULT '2026-09-01'
      );
      CREATE TABLE "TaskProof" (
        "id" text PRIMARY KEY, "commitmentId" text, "ownerId" text,
        "circleId" text, "reviewStatus" text, "replacedById" text,
        "isLate" boolean, "submittedAt" timestamp
      );
      CREATE TABLE "TaskProofReview" (
        "proofId" text, "reviewerId" text, "decision" text, "createdAt" timestamp
      );
      INSERT INTO "Membership" VALUES
        ('owner', 'circle'), ('a', 'circle'), ('b', 'circle'),
        ('c', 'circle'), ('d', 'circle'), ('owner', 'solo');
    `);
    const cases = [
      { id: "three-of-two", count: 3, verified: true },
      { id: "exactly-two", count: 2, verified: true },
      { id: "historical-miss", count: 3, status: "MISSED", verified: true },
      { id: "insufficient", count: 1 },
      { id: "challenged", count: 3, verdict: "CHALLENGED" },
      { id: "challenge-review", count: 3, challenge: true },
      { id: "replaced", count: 3, replaced: true },
      { id: "late-proof", count: 3, late: true },
      { id: "late-submission", count: 3, submitted: "2026-09-03" },
      { id: "late-review", count: 2, reviewTime: "2026-09-03" },
      { id: "deadline-review", count: 2, reviewTime: "2026-09-02" },
      { id: "self-and-outsider", count: 0, invalidReviews: true },
      {
        id: "already-verified",
        count: 0,
        status: "VERIFIED",
        verdict: "APPROVED",
        verified: true,
      },
      { id: "solo", count: 0, circle: "solo", verified: true },
      { id: "empty-circle", count: 0, circle: "empty" },
    ];
    for (const fixture of cases) {
      await db.query(
        `INSERT INTO "Commitment" ("id", "status", "dueAt") VALUES ($1, $2, '2026-09-02')`,
        [fixture.id, fixture.status ?? "AWAITING_REVIEW"],
      );
      await db.query(
        `INSERT INTO "TaskProof" VALUES ($1, $1, 'owner', $2, $3, $4, $5, $6)`,
        [
          fixture.id,
          fixture.circle ?? "circle",
          fixture.verdict ?? "PENDING",
          fixture.replaced ? "newer-proof" : null,
          fixture.late ?? false,
          fixture.submitted ?? "2026-09-01",
        ],
      );
      for (const reviewer of ["a", "b", "c"].slice(0, fixture.count)) {
        await db.query(
          `INSERT INTO "TaskProofReview" VALUES ($1, $2, 'APPROVED', $3)`,
          [fixture.id, reviewer, fixture.reviewTime ?? "2026-09-01"],
        );
      }
      if (fixture.challenge) {
        await db.query(
          `INSERT INTO "TaskProofReview" VALUES ($1, 'd', 'CHALLENGED', '2026-09-01')`,
          [fixture.id],
        );
      }
      if (fixture.invalidReviews) {
        await db.query(
          `INSERT INTO "TaskProofReview" VALUES
          ($1, 'owner', 'APPROVED', '2026-09-01'),
          ($1, 'former-member', 'APPROVED', '2026-09-01')`,
          [fixture.id],
        );
      }
    }
    await db.exec(migration);
    const read = () =>
      db.query<{
        id: string;
        status: string;
        updatedAt: Date;
        reviewStatus: string;
      }>(`SELECT c."id", c."status", c."updatedAt", p."reviewStatus"
      FROM "Commitment" c JOIN "TaskProof" p ON p."commitmentId" = c."id" ORDER BY c."id"`);
    const result = await read();
    for (const fixture of cases) {
      const row = result.rows.find((row) => row.id === fixture.id);
      expect(row?.status).toBe(
        fixture.verified ? "VERIFIED" : (fixture.status ?? "AWAITING_REVIEW"),
      );
      expect(row?.reviewStatus).toBe(
        fixture.verified ? "APPROVED" : (fixture.verdict ?? "PENDING"),
      );
    }
    await db.exec(migration);
    expect((await read()).rows).toEqual(result.rows);
  } finally {
    await db.close();
  }
});
