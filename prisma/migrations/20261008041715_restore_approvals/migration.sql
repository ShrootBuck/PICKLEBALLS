-- Approvals are back: half the circle, rounded down, verifies proof.
-- Everything runs in one transaction, so any failure leaves the data untouched.
-- Rows converted by 20261006050642_challenge_only_proofs kept their original
-- review id after an "approval_" prefix, which is how approvals are rebuilt.
BEGIN;

CREATE TYPE "ProofReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CHALLENGED');
CREATE TYPE "ProofReviewDecision" AS ENUM ('APPROVED', 'CHALLENGED');

-- Challenges become challenged reviews again, keeping their ids and likes.
ALTER TABLE "ProofChallenge" RENAME TO "TaskProofReview";
ALTER TABLE "TaskProofReview" RENAME COLUMN "challengerId" TO "reviewerId";
ALTER TABLE "TaskProofReview" RENAME COLUMN "reason" TO "note";
ALTER TABLE "TaskProofReview" ALTER COLUMN "note" DROP NOT NULL;
UPDATE "TaskProofReview" SET "note" = NULL WHERE "note" = '';
ALTER TABLE "TaskProofReview" ADD COLUMN "decision" "ProofReviewDecision" NOT NULL DEFAULT 'CHALLENGED';
ALTER TABLE "TaskProofReview" ALTER COLUMN "decision" DROP DEFAULT;
ALTER TABLE "TaskProofReview" RENAME CONSTRAINT "ProofChallenge_pkey" TO "TaskProofReview_pkey";
ALTER TABLE "TaskProofReview" RENAME CONSTRAINT "ProofChallenge_proofId_fkey" TO "TaskProofReview_proofId_fkey";
ALTER TABLE "TaskProofReview" RENAME CONSTRAINT "ProofChallenge_challengerId_fkey" TO "TaskProofReview_reviewerId_fkey";
ALTER TABLE "TaskProofReview" RENAME CONSTRAINT "ProofChallenge_circleId_fkey" TO "TaskProofReview_circleId_fkey";
DROP INDEX "ProofChallenge_proofId_key";
CREATE INDEX "TaskProofReview_proofId_idx" ON "TaskProofReview"("proofId");
CREATE UNIQUE INDEX "TaskProofReview_proofId_reviewerId_key" ON "TaskProofReview"("proofId", "reviewerId");
ALTER INDEX "ProofChallenge_circleId_createdAt_idx" RENAME TO "TaskProofReview_circleId_createdAt_idx";
ALTER INDEX "ProofChallenge_challengerId_createdAt_idx" RENAME TO "TaskProofReview_reviewerId_createdAt_idx";

ALTER TABLE "PostLike" DROP CONSTRAINT "PostLike_single_target";
ALTER TABLE "PostLike" RENAME COLUMN "challengeId" TO "reviewId";
ALTER TABLE "PostLike" RENAME CONSTRAINT "PostLike_challengeId_fkey" TO "PostLike_reviewId_fkey";
ALTER INDEX "PostLike_challengeId_idx" RENAME TO "PostLike_reviewId_idx";
ALTER INDEX "PostLike_userId_challengeId_key" RENAME TO "PostLike_userId_reviewId_key";
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_single_target"
  CHECK (num_nonnulls("proofId", "checkInUpdateId", "replyId", "reviewId", "streakEventId", "screenTimeSubmissionId") = 1);

ALTER TABLE "SocialReply" DROP CONSTRAINT "SocialReply_single_target";
ALTER TABLE "SocialReply" ADD COLUMN "reviewId" TEXT;
CREATE INDEX "SocialReply_reviewId_createdAt_idx" ON "SocialReply"("reviewId", "createdAt");
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "TaskProofReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_single_target"
  CHECK (num_nonnulls("commitmentId", "checkInId", "checkInUpdateId", "proofId", "reviewId", "bucketItemId", "streakEventId", "screenTimeSubmissionId") = 1);

-- Rebuild approvals. A comment carries the approval's note; a like alone
-- means the approval had none. A reviewer who has since challenged the same
-- proof keeps the challenge, and that approval stays a like or comment.
INSERT INTO "TaskProofReview" ("id", "proofId", "reviewerId", "circleId", "decision", "note", "createdAt")
SELECT substr(r."id", 10), r."proofId", r."authorId", r."circleId", 'APPROVED', r."body", r."createdAt"
FROM "SocialReply" r
JOIN "TaskProof" p ON p."id" = r."proofId"
WHERE left(r."id", 9) = 'approval_' AND r."authorId" <> p."ownerId"
ON CONFLICT DO NOTHING;

INSERT INTO "TaskProofReview" ("id", "proofId", "reviewerId", "circleId", "decision", "note", "createdAt")
SELECT substr(l."id", 10), l."proofId", l."userId", l."circleId", 'APPROVED', NULL, l."createdAt"
FROM "PostLike" l
JOIN "TaskProof" p ON p."id" = l."proofId"
WHERE left(l."id", 9) = 'approval_' AND l."userId" <> p."ownerId"
ON CONFLICT DO NOTHING;

-- Likes on approval comments move back onto the approval.
UPDATE "PostLike" l SET "reviewId" = t."id", "replyId" = NULL
FROM "TaskProofReview" t
WHERE left(l."replyId", 9) = 'approval_'
  AND t."id" = substr(l."replyId", 10)
  AND t."decision" = 'APPROVED';

-- Remove only the stand-ins that were rebuilt into approvals above.
DELETE FROM "PostLike" l
USING "TaskProofReview" t
WHERE left(l."id", 9) = 'approval_'
  AND t."id" = substr(l."id", 10)
  AND t."decision" = 'APPROVED'
  AND t."proofId" = l."proofId"
  AND t."reviewerId" = l."userId";

DELETE FROM "SocialReply" r
USING "TaskProofReview" t
WHERE left(r."id", 9) = 'approval_'
  AND t."id" = substr(r."id", 10)
  AND t."decision" = 'APPROVED'
  AND t."proofId" = r."proofId"
  AND t."reviewerId" = r."authorId";

-- Proof status. Everything currently done stays verified, including proof
-- posted while approvals were off.
ALTER TABLE "TaskProof" ADD COLUMN "reviewStatus" "ProofReviewStatus" NOT NULL DEFAULT 'PENDING';
UPDATE "TaskProof" p SET "reviewStatus" = 'CHALLENGED'
WHERE EXISTS (
  SELECT 1 FROM "TaskProofReview" t
  WHERE t."proofId" = p."id" AND t."decision" = 'CHALLENGED'
);
UPDATE "TaskProof" p SET "reviewStatus" = 'APPROVED'
FROM "Commitment" c
WHERE c."id" = p."commitmentId"
  AND c."status" = 'DONE'
  AND p."replacedById" IS NULL
  AND p."reviewStatus" = 'PENDING';

-- Each task fixes its approval count when created, as before.
ALTER TABLE "Commitment" ADD COLUMN "requiredApprovals" INTEGER;
UPDATE "Commitment" c SET "requiredApprovals" = (
  SELECT (count(*) / 2)::integer FROM "Membership" m WHERE m."circleId" = c."circleId"
);

CREATE TYPE "CommitmentStatus_new" AS ENUM ('OPEN', 'AWAITING_REVIEW', 'VERIFIED', 'MISSED', 'RENEGOTIATED');
ALTER TABLE "Commitment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Commitment" ALTER COLUMN "status" TYPE "CommitmentStatus_new" USING (
  CASE "status"::text WHEN 'DONE' THEN 'VERIFIED' ELSE "status"::text END
)::"CommitmentStatus_new";
ALTER TYPE "CommitmentStatus" RENAME TO "CommitmentStatus_old";
ALTER TYPE "CommitmentStatus_new" RENAME TO "CommitmentStatus";
DROP TYPE "CommitmentStatus_old";
ALTER TABLE "Commitment" ALTER COLUMN "status" SET DEFAULT 'OPEN';

COMMIT;
