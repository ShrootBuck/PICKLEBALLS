-- CreateEnum
CREATE TYPE "BucketItemStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BucketVoteStage" AS ENUM ('PROPOSAL', 'COMPLETION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityKind" ADD VALUE 'BUCKET_ITEM_PROPOSED';
ALTER TYPE "ActivityKind" ADD VALUE 'BUCKET_ITEM_APPROVED';
ALTER TYPE "ActivityKind" ADD VALUE 'BUCKET_ITEM_COMPLETION_REQUESTED';
ALTER TYPE "ActivityKind" ADD VALUE 'BUCKET_ITEM_COMPLETED';

-- AlterTable
ALTER TABLE "SocialReply" ADD COLUMN     "bucketItemId" TEXT;

-- CreateTable
CREATE TABLE "BucketItem" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "details" VARCHAR(500),
    "status" "BucketItemStatus" NOT NULL DEFAULT 'PROPOSED',
    "approvedAt" TIMESTAMP(3),
    "completionRequestedById" TEXT,
    "completionRequestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BucketItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BucketVote" (
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" "BucketVoteStage" NOT NULL,
    "inFavor" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BucketVote_pkey" PRIMARY KEY ("itemId","stage","userId")
);

-- CreateIndex
CREATE INDEX "BucketItem_circleId_status_createdAt_idx" ON "BucketItem"("circleId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BucketVote_userId_idx" ON "BucketVote"("userId");

-- CreateIndex
CREATE INDEX "SocialReply_bucketItemId_createdAt_idx" ON "SocialReply"("bucketItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_bucketItemId_fkey" FOREIGN KEY ("bucketItemId") REFERENCES "BucketItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketItem" ADD CONSTRAINT "BucketItem_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketItem" ADD CONSTRAINT "BucketItem_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketItem" ADD CONSTRAINT "BucketItem_completionRequestedById_fkey" FOREIGN KEY ("completionRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketVote" ADD CONSTRAINT "BucketVote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BucketItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BucketVote" ADD CONSTRAINT "BucketVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every reply belongs to exactly one task, check-in, proof, verdict, or bucket list item.
ALTER TABLE "SocialReply" DROP CONSTRAINT "SocialReply_single_target";
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_single_target"
  CHECK (num_nonnulls("commitmentId", "checkInId", "checkInUpdateId", "proofId", "reviewId", "bucketItemId") = 1);
