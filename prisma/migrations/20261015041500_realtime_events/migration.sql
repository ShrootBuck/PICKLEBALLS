BEGIN;

-- Only routing keys leave the database. PostgreSQL delivers these on COMMIT,
-- folds identical payloads in a transaction, and discards them on ROLLBACK.
CREATE FUNCTION pb_realtime_emit(scope text, target text, kind text DEFAULT 'refresh', conversation text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF target IS NOT NULL THEN
    PERFORM pg_notify('pickleballs_realtime', jsonb_build_object(
      'scope', scope, 'id', target,
      'event', jsonb_strip_nulls(jsonb_build_object('type', kind, 'conversationId', conversation))
    )::text);
  END IF;
END;
$$;

CREATE FUNCTION pb_realtime_change() RETURNS trigger LANGUAGE plpgsql AS $$
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
      PERFORM pb_realtime_emit('circle', row_data->>'circleId');
      -- A removed member must refresh too, even though circle fan-out now excludes them.
      PERFORM pb_realtime_emit('user', row_data->>'userId');
    WHEN 'conversation' THEN
      PERFORM pb_realtime_emit('user', row_data->>'userAId', 'messages', row_data->>'id');
      PERFORM pb_realtime_emit('user', row_data->>'userBId', 'messages', row_data->>'id');
    WHEN 'message' THEN
      PERFORM pb_realtime_emit('user', row_data->>'senderId', 'messages', row_data->>'conversationId');
      PERFORM pb_realtime_emit('user', row_data->>'recipientId', 'messages', row_data->>'conversationId');
    WHEN 'reaction' THEN
      SELECT to_jsonb(m) INTO parent_data FROM "DirectMessage" m WHERE id = row_data->>'messageId';
      PERFORM pb_realtime_emit('user', parent_data->>'senderId', 'messages', parent_data->>'conversationId');
      PERFORM pb_realtime_emit('user', parent_data->>'recipientId', 'messages', parent_data->>'conversationId');
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

-- Public circle data. Private drafts, preferences and processing state are
-- explicitly owner-scoped below, even when their rows contain a circleId.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Commitment', 'TaskProof', 'TaskProofReview', 'CheckIn', 'CheckInUpdate',
    'SocialReply', 'PostLike', 'BucketItem', 'Goal', 'ScreenTimeSubmission',
    'StreakEvent', 'ActivityEvent', 'Invite'
  ] LOOP
    EXECUTE format('CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION pb_realtime_change(''circle'', ''circleId'')', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['StreakEntry', 'StreakSchedule', 'StreakBreak', 'StreakNudge'] LOOP
    EXECUTE format('CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION pb_realtime_change(''streak-child'')', table_name);
  END LOOP;
END;
$$;

CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "Circle" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('circle', 'id');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "Membership" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('membership');
CREATE TRIGGER realtime_change AFTER UPDATE OR DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('profile');
CREATE TRIGGER realtime_change AFTER DELETE ON "Session" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('user', 'userId', 'session');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "Notification" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('user', 'recipientId');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "NotificationPreference" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('user', 'userId');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "WorkSession" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('user', 'userId');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "ScreenTimeReading" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('user', 'userId');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "MediaUpload" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('user', 'ownerId', 'media');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "PendingProof" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('user', 'ownerId', 'media');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "TimeblockChat" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('user', 'userId', 'timeblock-chat');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "DirectConversation" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('conversation');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "DirectMessage" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('message');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "DirectReaction" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('reaction');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "BucketVote" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('bucket-vote');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "GoalMilestone" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('milestone');
CREATE TRIGGER realtime_change AFTER INSERT OR UPDATE OR DELETE ON "Streak" FOR EACH ROW EXECUTE FUNCTION pb_realtime_change('streak');

COMMIT;
