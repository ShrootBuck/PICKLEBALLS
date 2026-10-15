BEGIN;

-- DropForeignKey
ALTER TABLE "DirectMessage" DROP CONSTRAINT "DirectMessage_senderId_fkey";

-- AlterTable
ALTER TABLE "DirectConversation" ADD COLUMN     "circleId" TEXT,
ALTER COLUMN "userAId" DROP NOT NULL,
ALTER COLUMN "userBId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DirectMessage" ALTER COLUMN "senderId" DROP NOT NULL,
ALTER COLUMN "recipientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "groupReadThrough" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "DirectConversation_circleId_key" ON "DirectConversation"("circleId");

-- AddForeignKey
ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve every existing pair and message while allowing exactly one chat per circle.
ALTER TABLE "DirectConversation" DROP CONSTRAINT "DirectConversation_ordered_pair";
ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_scope" CHECK (
  ("circleId" IS NOT NULL AND "userAId" IS NULL AND "userBId" IS NULL) OR
  ("circleId" IS NULL AND "userAId" IS NOT NULL AND "userBId" IS NOT NULL AND "userAId" COLLATE "C" < "userBId" COLLATE "C")
);
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_groupReadThrough_nonnegative" CHECK ("groupReadThrough" >= 0);

-- Group notifications use current membership at delivery, just like circle updates.
CREATE OR REPLACE FUNCTION pb_realtime_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  parent_data jsonb;
  circle_id text;
  peer record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

  CASE TG_ARGV[0]
    WHEN 'circle' THEN
      PERFORM pb_realtime_emit('circle', row_data->>TG_ARGV[1]);
    WHEN 'user' THEN
      PERFORM pb_realtime_emit('user', row_data->>TG_ARGV[1], COALESCE(TG_ARGV[2], 'refresh'));
    WHEN 'membership' THEN
      IF TG_OP = 'UPDATE' AND
        (row_data - 'groupReadThrough') = (to_jsonb(OLD) - 'groupReadThrough') THEN
        PERFORM pb_realtime_emit('user', row_data->>'userId', 'messages');
        RETURN NULL;
      END IF;
      PERFORM pb_realtime_emit('circle', row_data->>'circleId');
      -- A removed member must refresh too, even though circle fan-out now excludes them.
      PERFORM pb_realtime_emit('user', row_data->>'userId');
    WHEN 'conversation' THEN
      PERFORM pb_realtime_emit('circle', row_data->>'circleId', 'messages', row_data->>'id');
      PERFORM pb_realtime_emit('user', row_data->>'userAId', 'messages', row_data->>'id');
      PERFORM pb_realtime_emit('user', row_data->>'userBId', 'messages', row_data->>'id');
    WHEN 'message' THEN
      SELECT "circleId" INTO circle_id FROM "DirectConversation" WHERE id = row_data->>'conversationId';
      PERFORM pb_realtime_emit('circle', circle_id, 'messages', row_data->>'conversationId');
      IF circle_id IS NULL THEN
        PERFORM pb_realtime_emit('user', row_data->>'senderId', 'messages', row_data->>'conversationId');
        PERFORM pb_realtime_emit('user', row_data->>'recipientId', 'messages', row_data->>'conversationId');
      END IF;
    WHEN 'reaction' THEN
      SELECT to_jsonb(m) INTO parent_data FROM "DirectMessage" m WHERE id = row_data->>'messageId';
      SELECT "circleId" INTO circle_id FROM "DirectConversation" WHERE id = parent_data->>'conversationId';
      PERFORM pb_realtime_emit('circle', circle_id, 'messages', parent_data->>'conversationId');
      IF circle_id IS NULL THEN
        PERFORM pb_realtime_emit('user', parent_data->>'senderId', 'messages', parent_data->>'conversationId');
        PERFORM pb_realtime_emit('user', parent_data->>'recipientId', 'messages', parent_data->>'conversationId');
      END IF;
    WHEN 'bucket-vote' THEN
      SELECT "circleId" INTO circle_id FROM "BucketItem" WHERE id = row_data->>'itemId';
      PERFORM pb_realtime_emit('circle', circle_id);
    WHEN 'milestone' THEN
      SELECT "circleId" INTO circle_id FROM "Goal" WHERE id = row_data->>'goalId';
      PERFORM pb_realtime_emit('circle', circle_id);
    WHEN 'streak', 'streak-child' THEN
      IF TG_ARGV[0] = 'streak' THEN parent_data := row_data;
      ELSE SELECT to_jsonb(s) INTO parent_data FROM "Streak" s WHERE id = row_data->>'streakId';
      END IF;
      IF parent_data->>'visibility' = 'CIRCLE' THEN
        PERFORM pb_realtime_emit('circle', parent_data->>'circleId');
      ELSE
        PERFORM pb_realtime_emit('user', parent_data->>'userId');
      END IF;
    WHEN 'profile' THEN
      PERFORM pb_realtime_emit('user', row_data->>'id');
      IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND
        (NEW.name, NEW.image, NEW.initials) IS DISTINCT FROM (OLD.name, OLD.image, OLD.initials)) THEN
        FOR peer IN SELECT "circleId" FROM "Membership" WHERE "userId" = row_data->>'id' LOOP
          PERFORM pb_realtime_emit('circle', peer."circleId");
        END LOOP;
        FOR peer IN SELECT id, "userAId", "userBId" FROM "DirectConversation"
          WHERE "userAId" = row_data->>'id' OR "userBId" = row_data->>'id' LOOP
          PERFORM pb_realtime_emit('user', peer."userAId", 'messages', peer.id);
          PERFORM pb_realtime_emit('user', peer."userBId", 'messages', peer.id);
        END LOOP;
      END IF;
  END CASE;
  RETURN NULL;
END;
$$;


COMMIT;
