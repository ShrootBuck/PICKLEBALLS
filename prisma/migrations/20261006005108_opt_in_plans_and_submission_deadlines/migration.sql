-- AlterEnum
ALTER TYPE "BucketVoteStage" ADD VALUE 'RSVP';

-- AlterTable
ALTER TABLE "BucketItem" ADD COLUMN     "completionParticipantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "everyoneRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minimumParticipants" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "planVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiredMemberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Commitment" ADD COLUMN     "proofSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "requiredApprovals" INTEGER;

-- Existing tasks adopt a fixed target at rollout. New tasks snapshot at creation.
UPDATE "Commitment" c SET "requiredApprovals" = (
  SELECT (COUNT(*) / 2)::integer FROM "Membership" m WHERE m."circleId" = c."circleId"
);
-- Preserve accepted on-time evidence, including media still processing.
UPDATE "Commitment" c SET "proofSubmittedAt" = submissions.first_submission
FROM (
  SELECT "commitmentId", MIN(submitted) AS first_submission FROM (
    SELECT "commitmentId", "submittedAt" AS submitted FROM "TaskProof" WHERE "isLate" = false
    UNION ALL
    SELECT p."commitmentId", p."createdAt" FROM "PendingProof" p
      JOIN "Commitment" c ON c.id = p."commitmentId"
      WHERE p."createdAt" < c."dueAt" AND p.dismissed = false
  ) accepted GROUP BY "commitmentId"
) submissions WHERE c.id = submissions."commitmentId";
-- Restore timely submissions that the old review deadline marked missed.
UPDATE "Commitment" c SET status = CASE
  WHEN EXISTS (SELECT 1 FROM "TaskProof" p WHERE p."commitmentId" = c.id AND p."replacedById" IS NULL AND p."reviewStatus" = 'APPROVED') THEN 'VERIFIED'::"CommitmentStatus"
  WHEN EXISTS (SELECT 1 FROM "TaskProof" p WHERE p."commitmentId" = c.id AND p."replacedById" IS NULL AND p."reviewStatus" = 'PENDING') THEN 'AWAITING_REVIEW'::"CommitmentStatus"
  ELSE 'OPEN'::"CommitmentStatus" END
WHERE c.status = 'MISSED' AND c."proofSubmittedAt" IS NOT NULL;
-- Keep existing completion rounds fixed. Joining/leaving no longer changes them.
UPDATE "BucketItem" b SET "completionParticipantIds" = ARRAY(
  SELECT m."userId" FROM "Membership" m WHERE m."circleId" = b."circleId"
) WHERE b."completionRequestedAt" IS NOT NULL;
