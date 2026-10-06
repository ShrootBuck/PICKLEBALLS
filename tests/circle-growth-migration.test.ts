import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20261006005108_opt_in_plans_and_submission_deadlines/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
test("rollout freezes requirements and restores timely evidence without forgiving missing or late proof", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TYPE "BucketVoteStage" AS ENUM ('PROPOSAL', 'COMPLETION');
      CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN','RENEGOTIATED','AWAITING_REVIEW','VERIFIED','MISSED');
      CREATE TABLE "Membership" ("userId" text, "circleId" text);
      CREATE TABLE "Commitment" (id text PRIMARY KEY, "circleId" text, status "CommitmentStatus", "dueAt" timestamp);
      CREATE TABLE "TaskProof" ("commitmentId" text, "submittedAt" timestamp, "isLate" boolean, "replacedById" text, "reviewStatus" text);
      CREATE TABLE "PendingProof" ("commitmentId" text, "createdAt" timestamp, dismissed boolean);
      CREATE TABLE "BucketItem" (id text, "circleId" text, "completionRequestedAt" timestamp);
      INSERT INTO "Membership" VALUES ('a','circle'), ('b','circle'), ('c','circle'), ('d','circle');
      INSERT INTO "Commitment" SELECT name, 'circle', 'MISSED', '2026-10-02'::timestamp FROM unnest(ARRAY['missing','late','pending','challenged','verified','encoding','dismissed']) AS name;
      INSERT INTO "TaskProof" VALUES
        ('late','2026-10-03',true,NULL,'PENDING'),
        ('pending','2026-10-01',false,NULL,'PENDING'),
        ('challenged','2026-10-01',false,NULL,'CHALLENGED'),
        ('verified','2026-10-01',false,NULL,'APPROVED');
      INSERT INTO "PendingProof" VALUES ('encoding','2026-10-01',false),('dismissed','2026-10-01',true);
      INSERT INTO "BucketItem" VALUES ('trip','circle','2026-10-01');
    `);
    await db.exec(migration);
    const { rows } = await db.query<{
      id: string;
      status: string;
      requiredApprovals: number;
      proofSubmittedAt: Date | null;
    }>('SELECT * FROM "Commitment" ORDER BY id');
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const row of rows) expect(row.requiredApprovals).toBe(2);
    for (const id of ["missing", "late", "dismissed"])
      expect(byId.get(id)).toMatchObject({
        status: "MISSED",
        proofSubmittedAt: null,
      });
    expect(byId.get("pending")?.status).toBe("AWAITING_REVIEW");
    expect(byId.get("challenged")?.status).toBe("OPEN");
    expect(byId.get("encoding")?.status).toBe("OPEN");
    expect(byId.get("verified")?.status).toBe("VERIFIED");
    await db.exec(
      `DELETE FROM "Membership" WHERE "userId"='d'; INSERT INTO "Membership" VALUES ('new','circle');`,
    );
    expect(
      (
        await db.query<{ completionParticipantIds: string[] }>(
          'SELECT "completionParticipantIds" FROM "BucketItem"',
        )
      ).rows[0].completionParticipantIds,
    ).toEqual(["a", "b", "c", "d"]);
  } finally {
    await db.close();
  }
});
