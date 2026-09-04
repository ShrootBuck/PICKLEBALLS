-- AlterTable
ALTER TABLE "TaskProof" ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "startedAt" TIMESTAMP(3);

-- Existing proof uploads become 30-minute blocks ending at submission time.
UPDATE "TaskProof"
SET "completedAt" = "submittedAt",
    "startedAt" = "submittedAt" - INTERVAL '30 minutes';

ALTER TABLE "TaskProof" ALTER COLUMN "completedAt" SET NOT NULL,
ALTER COLUMN "startedAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "TaskProof_ownerId_completedAt_idx" ON "TaskProof"("ownerId", "completedAt");
