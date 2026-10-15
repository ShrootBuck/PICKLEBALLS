import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = (name: string) =>
  readFileSync(
    new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
    "utf8",
  );
test("circle chat migration preserves populated private history, receipts, reactions and media", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "User" (id text PRIMARY KEY);
      CREATE TABLE "Circle" (id text PRIMARY KEY);
      CREATE TABLE "Membership" ("userId" text, "circleId" text);
      CREATE TABLE "MediaUpload" (id text PRIMARY KEY, "circleId" text NOT NULL);
      INSERT INTO "User" VALUES ('a'),('b'),('c');
      INSERT INTO "Circle" VALUES ('one'),('two');
      INSERT INTO "Membership" VALUES ('a','one'),('b','one');
    `);
    await db.exec(migration("20261015031746_direct_messages"));
    await db.exec(`
      INSERT INTO "DirectConversation" (id,"userAId","userBId",sequence,revision) VALUES ('private','a','b',1,2);
      INSERT INTO "DirectMessage" (id,"conversationId","senderId","recipientId","clientId",sequence,revision,body,"mediaIds","readAt")
        VALUES ('message','private','a','b','retry',1,2,'Keep this',ARRAY['image'],'2026-10-14');
      INSERT INTO "DirectReaction" VALUES ('message','b','🔥');
      INSERT INTO "MediaUpload" VALUES ('image',NULL,'private');
    `);
    const before = await db.query('SELECT * FROM "DirectMessage"');
    await db.exec(migration("20261015044853_circle_group_chat"));
    expect((await db.query('SELECT * FROM "DirectMessage"')).rows).toEqual(
      before.rows,
    );
    expect(
      (await db.query('SELECT * FROM "DirectReaction"')).rows,
    ).toHaveLength(1);
    expect((await db.query('SELECT * FROM "MediaUpload"')).rows).toHaveLength(
      1,
    );
    expect(
      (await db.query('SELECT "groupReadThrough" FROM "Membership"')).rows,
    ).toEqual([{ groupReadThrough: 0 }, { groupReadThrough: 0 }]);
    await db.exec(
      `INSERT INTO "DirectConversation" (id,"circleId") VALUES ('group','one'),('other','two')`,
    );
    await expect(
      db.exec(
        `INSERT INTO "DirectConversation" (id,"circleId") VALUES ('duplicate','one')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(`INSERT INTO "DirectConversation" (id) VALUES ('no-members')`),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `INSERT INTO "DirectConversation" (id,"circleId","userAId","userBId") VALUES ('mixed','two','b','c')`,
      ),
    ).rejects.toThrow();
    await db.exec(`
      INSERT INTO "DirectMessage" (id,"conversationId","senderId","clientId",sequence,revision,body)
        VALUES ('shared','group','a','group-retry',1,1,'Circle hello');
      DELETE FROM "Circle" WHERE id = 'one';
    `);
    expect(
      (await db.query('SELECT id FROM "DirectConversation" ORDER BY id')).rows,
    ).toEqual([{ id: "other" }, { id: "private" }]);
    expect((await db.query('SELECT * FROM "DirectMessage"')).rows).toEqual(
      before.rows,
    );
  } finally {
    await db.close();
  }
});
