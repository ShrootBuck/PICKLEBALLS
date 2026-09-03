-- Backfill objects the baseline migration claimed but never executed.
-- Prod was baselined with `migrate resolve --applied` (tables already existed
-- from the old `db push` days), so these two never actually ran there.
-- Both statements are idempotent: safe to apply on any database, including
-- ones where the baseline really did run.

CREATE INDEX IF NOT EXISTS "ActivityEvent_circleId_kind_createdAt_idx"
  ON "ActivityEvent"("circleId", "kind", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SocialReply_single_target'
  ) THEN
    ALTER TABLE "SocialReply"
      ADD CONSTRAINT "SocialReply_single_target"
      CHECK (num_nonnulls("commitmentId", "checkInId", "proofId", "reviewId") = 1);
  END IF;
END $$;
