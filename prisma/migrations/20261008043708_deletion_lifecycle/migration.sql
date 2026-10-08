BEGIN;
-- AlterEnum
ALTER TYPE "CommitmentStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "BucketItem" DROP CONSTRAINT "BucketItem_proposerId_fkey";

-- DropForeignKey
ALTER TABLE "TaskProofReview" DROP CONSTRAINT "TaskProofReview_reviewerId_fkey";

-- AlterTable
ALTER TABLE "BucketItem" ALTER COLUMN "proposerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TaskProofReview" ALTER COLUMN "reviewerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ObjectDeletion" (
    "key" TEXT NOT NULL,
    "prefix" BOOLEAN NOT NULL DEFAULT false,
    "uploadId" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retryUntil" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ObjectDeletion_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ObjectDeletion_nextAttemptAt_idx" ON "ObjectDeletion"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "TaskProofReview" ADD CONSTRAINT "TaskProofReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketItem" ADD CONSTRAINT "BucketItem_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
