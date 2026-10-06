-- Proof completes a task on post. Friends can only challenge it.
-- Everything runs in one transaction, so any failure leaves the data untouched.
BEGIN;

-- Approvals become likes on the proof.
INSERT INTO "PostLike" ("id", "userId", "circleId", "proofId", "createdAt")
SELECT 'approval_' || r."id", r."reviewerId", r."circleId", r."proofId", r."createdAt"
FROM "TaskProofReview" r
WHERE r."decision" = 'APPROVED'
ON CONFLICT ("userId", "proofId") DO NOTHING;

-- Approval comments become proof comments, keeping their author and time.
INSERT INTO "SocialReply" ("id", "authorId", "circleId", "proofId", "body", "createdAt", "updatedAt")
SELECT 'approval_' || r."id", r."reviewerId", r."circleId", r."proofId", btrim(r."note"), r."createdAt", r."createdAt"
FROM "TaskProofReview" r
WHERE r."decision" = 'APPROVED' AND btrim(coalesce(r."note", '')) <> '';

-- Likes on those approval comments follow them.
UPDATE "PostLike" l SET "replyId" = 'approval_' || r."id", "reviewId" = NULL
FROM "TaskProofReview" r
WHERE l."reviewId" = r."id"
  AND r."decision" = 'APPROVED'
  AND btrim(coalesce(r."note", '')) <> '';

-- Replies to any verdict join the proof's own comments.
UPDATE "SocialReply" s SET "proofId" = r."proofId", "reviewId" = NULL
FROM "TaskProofReview" r
WHERE s."reviewId" = r."id";

-- Settle task status while the old proof status still exists. Proof that was
-- waiting on approvals, or already approved, now counts as done.
UPDATE "Commitment" c SET "status" = 'VERIFIED', "updatedAt" = CURRENT_TIMESTAMP
WHERE c."status" IN ('AWAITING_REVIEW', 'OPEN', 'RENEGOTIATED')
  AND EXISTS (
    SELECT 1 FROM "TaskProof" p
    WHERE p."commitmentId" = c."id"
      AND p."replacedById" IS NULL
      AND p."reviewStatus" <> 'CHALLENGED'
  );

DELETE FROM "TaskProofReview" WHERE "decision" = 'APPROVED';

-- What remains are challenges. Keep their rows, likes, and ids.
ALTER TABLE "TaskProofReview" RENAME TO "ProofChallenge";
ALTER TABLE "ProofChallenge" RENAME COLUMN "reviewerId" TO "challengerId";
ALTER TABLE "ProofChallenge" RENAME COLUMN "note" TO "reason";
UPDATE "ProofChallenge" SET "reason" = '' WHERE "reason" IS NULL;
ALTER TABLE "ProofChallenge" ALTER COLUMN "reason" SET NOT NULL;
ALTER TABLE "ProofChallenge" DROP COLUMN "decision";
ALTER TABLE "ProofChallenge" RENAME CONSTRAINT "TaskProofReview_pkey" TO "ProofChallenge_pkey";
ALTER TABLE "ProofChallenge" RENAME CONSTRAINT "TaskProofReview_proofId_fkey" TO "ProofChallenge_proofId_fkey";
ALTER TABLE "ProofChallenge" RENAME CONSTRAINT "TaskProofReview_reviewerId_fkey" TO "ProofChallenge_challengerId_fkey";
ALTER TABLE "ProofChallenge" RENAME CONSTRAINT "TaskProofReview_circleId_fkey" TO "ProofChallenge_circleId_fkey";
DROP INDEX "TaskProofReview_proofId_reviewerId_key";
DROP INDEX "TaskProofReview_proofId_idx";
-- A challenge reopens the task, so a proof never had more than one.
CREATE UNIQUE INDEX "ProofChallenge_proofId_key" ON "ProofChallenge"("proofId");
ALTER INDEX "TaskProofReview_circleId_createdAt_idx" RENAME TO "ProofChallenge_circleId_createdAt_idx";
ALTER INDEX "TaskProofReview_reviewerId_createdAt_idx" RENAME TO "ProofChallenge_challengerId_createdAt_idx";

ALTER TABLE "PostLike" DROP CONSTRAINT "PostLike_single_target";
ALTER TABLE "PostLike" RENAME COLUMN "reviewId" TO "challengeId";
ALTER TABLE "PostLike" RENAME CONSTRAINT "PostLike_reviewId_fkey" TO "PostLike_challengeId_fkey";
ALTER INDEX "PostLike_reviewId_idx" RENAME TO "PostLike_challengeId_idx";
ALTER INDEX "PostLike_userId_reviewId_key" RENAME TO "PostLike_userId_challengeId_key";
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_single_target"
  CHECK (num_nonnulls("proofId", "checkInUpdateId", "replyId", "challengeId", "streakEventId", "screenTimeSubmissionId") = 1);

ALTER TABLE "SocialReply" DROP CONSTRAINT "SocialReply_single_target";
ALTER TABLE "SocialReply" DROP CONSTRAINT "SocialReply_reviewId_fkey";
DROP INDEX "SocialReply_reviewId_createdAt_idx";
ALTER TABLE "SocialReply" DROP COLUMN "reviewId";
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_single_target"
  CHECK (num_nonnulls("commitmentId", "checkInId", "checkInUpdateId", "proofId", "bucketItemId", "streakEventId", "screenTimeSubmissionId") = 1);

ALTER TABLE "TaskProof" DROP COLUMN "reviewStatus",
DROP COLUMN "aiStatus",
DROP COLUMN "aiVisibleEvidence",
DROP COLUMN "aiUncertainty",
DROP COLUMN "aiReviewerQuestion",
DROP COLUMN "aiTaskMatch",
DROP COLUMN "aiOneLiner";

ALTER TABLE "Commitment" DROP COLUMN "requiredApprovals",
DROP COLUMN "definitionOfDone";

CREATE TYPE "CommitmentStatus_new" AS ENUM ('OPEN', 'DONE', 'MISSED', 'RENEGOTIATED');
ALTER TABLE "Commitment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Commitment" ALTER COLUMN "status" TYPE "CommitmentStatus_new" USING (
  CASE "status"::text
    WHEN 'VERIFIED' THEN 'DONE'
    -- Only inconsistent rows reach this: no standing proof to count.
    WHEN 'AWAITING_REVIEW' THEN 'OPEN'
    ELSE "status"::text
  END
)::"CommitmentStatus_new";
ALTER TYPE "CommitmentStatus" RENAME TO "CommitmentStatus_old";
ALTER TYPE "CommitmentStatus_new" RENAME TO "CommitmentStatus";
DROP TYPE "CommitmentStatus_old";
ALTER TABLE "Commitment" ALTER COLUMN "status" SET DEFAULT 'OPEN';

DROP TYPE "ProofReviewDecision";
DROP TYPE "ProofReviewStatus";
DROP TYPE "AIAssessmentStatus";

-- Retired check-in labels were rewritten to YAY/NAY on 2026-09-04.
CREATE TYPE "DailySignal_new" AS ENUM ('YAY', 'NAY');
ALTER TABLE "CheckIn" ALTER COLUMN "signal" TYPE "DailySignal_new" USING (
  CASE WHEN "signal"::text IN ('NAY', 'AT_RISK') THEN 'NAY' ELSE 'YAY' END
)::"DailySignal_new";
ALTER TABLE "CheckInUpdate" ALTER COLUMN "signal" TYPE "DailySignal_new" USING (
  CASE WHEN "signal"::text IN ('NAY', 'AT_RISK') THEN 'NAY' ELSE 'YAY' END
)::"DailySignal_new";
ALTER TYPE "DailySignal" RENAME TO "DailySignal_old";
ALTER TYPE "DailySignal_new" RENAME TO "DailySignal";
DROP TYPE "DailySignal_old";

-- Five-point moods move to the valence scale at their band centers.
UPDATE "CheckInUpdate" SET "valence" = CASE "mood"
    WHEN 1 THEN -86
    WHEN 2 THEN -57
    WHEN 3 THEN 0
    WHEN 4 THEN 57
    WHEN 5 THEN 86
  END
WHERE "valence" IS NULL AND "mood" IS NOT NULL;
ALTER TABLE "CheckInUpdate" DROP COLUMN "mood";

ALTER TABLE "NotificationPreference" DROP COLUMN "replies",
DROP COLUMN "proofReviews",
DROP COLUMN "taskMissed",
DROP COLUMN "taskCreated",
DROP COLUMN "checkIns",
DROP COLUMN "screenTime";

-- Wrapped was removed; its write-ups were kept only for the old release.
DROP TABLE "WeeklyWin";

COMMIT;
