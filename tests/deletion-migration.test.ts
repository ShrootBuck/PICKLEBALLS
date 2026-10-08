import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(
  new URL(
    "../prisma/migrations/20261008043708_deletion_lifecycle/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
test("deletion migration retains populated shared records and anonymizes only deleted attribution", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TYPE "CommitmentStatus" AS ENUM ('OPEN','AWAITING_REVIEW','VERIFIED','MISSED','RENEGOTIATED');
      CREATE TABLE "User" (id text PRIMARY KEY);
      CREATE TABLE "BucketItem" (id text PRIMARY KEY, "proposerId" text NOT NULL, title text, CONSTRAINT "BucketItem_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"(id) ON DELETE CASCADE);
      CREATE TABLE "TaskProofReview" (id text PRIMARY KEY, "reviewerId" text NOT NULL, decision text, CONSTRAINT "TaskProofReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"(id) ON DELETE CASCADE);
      INSERT INTO "User" VALUES ('departing'),('staying');
      INSERT INTO "BucketItem" VALUES ('shared','departing','Keep the plan'),('other','staying','Other plan');
      INSERT INTO "TaskProofReview" VALUES ('review','departing','APPROVED'),('other-review','staying','CHALLENGED');
    `);
    await db.exec(sql);
    expect((await db.query('SELECT * FROM "BucketItem"')).rows).toHaveLength(2);
    expect(
      (await db.query('SELECT * FROM "TaskProofReview"')).rows,
    ).toHaveLength(2);
    await db.exec(`DELETE FROM "User" WHERE id='departing'`);
    expect(
      (await db.query('SELECT * FROM "BucketItem" ORDER BY id')).rows,
    ).toEqual([
      { id: "other", proposerId: "staying", title: "Other plan" },
      { id: "shared", proposerId: null, title: "Keep the plan" },
    ]);
    expect(
      (await db.query('SELECT * FROM "TaskProofReview" ORDER BY id')).rows,
    ).toEqual([
      { id: "other-review", reviewerId: "staying", decision: "CHALLENGED" },
      { id: "review", reviewerId: null, decision: "APPROVED" },
    ]);
  } finally {
    await db.close();
  }
});
