-- The half-circle policy changed the displayed threshold without updating
-- existing verdicts. Repair historical misses too, but only when the proof
-- and enough current peers' approvals arrived before the task deadline.
WITH eligible AS (
  SELECT p."id", p."commitmentId"
  FROM "TaskProof" p
  JOIN "Commitment" c ON c."id" = p."commitmentId"
  WHERE p."reviewStatus" = 'PENDING'
    AND p."replacedById" IS NULL
    AND NOT p."isLate"
    AND p."submittedAt" <= c."dueAt"
    AND c."status" IN ('OPEN', 'RENEGOTIATED', 'AWAITING_REVIEW', 'MISSED')
    AND NOT EXISTS (
      SELECT 1 FROM "TaskProofReview" r
      WHERE r."proofId" = p."id" AND r."decision" = 'CHALLENGED'
    )
    AND (
      SELECT count(DISTINCT r."reviewerId")
      FROM "TaskProofReview" r
      JOIN "Membership" m
        ON m."userId" = r."reviewerId" AND m."circleId" = p."circleId"
      WHERE r."proofId" = p."id"
        AND r."reviewerId" <> p."ownerId"
        AND r."decision" = 'APPROVED'
        AND r."createdAt" < c."dueAt"
    ) >= (
      SELECT count(*) / 2 FROM "Membership" m
      WHERE m."circleId" = p."circleId"
    )
    AND EXISTS (
      SELECT 1 FROM "Membership" m WHERE m."circleId" = p."circleId"
    )
), approved AS (
  UPDATE "TaskProof" p SET "reviewStatus" = 'APPROVED'
  FROM eligible e WHERE p."id" = e."id"
  RETURNING p."commitmentId"
)
UPDATE "Commitment" c SET "status" = 'VERIFIED', "updatedAt" = CURRENT_TIMESTAMP
FROM approved a WHERE c."id" = a."commitmentId";
