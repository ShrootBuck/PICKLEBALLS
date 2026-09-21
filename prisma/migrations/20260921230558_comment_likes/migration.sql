/*
  Warnings:

  - A unique constraint covering the columns `[userId,replyId]` on the table `PostLike` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,reviewId]` on the table `PostLike` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PostLike" ADD COLUMN     "replyId" TEXT,
ADD COLUMN     "reviewId" TEXT;

-- CreateIndex
CREATE INDEX "PostLike_replyId_idx" ON "PostLike"("replyId");

-- CreateIndex
CREATE INDEX "PostLike_reviewId_idx" ON "PostLike"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_userId_replyId_key" ON "PostLike"("userId", "replyId");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_userId_reviewId_key" ON "PostLike"("userId", "reviewId");

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "SocialReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "TaskProofReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every like belongs to exactly one post, comment, or verdict.
ALTER TABLE "PostLike" DROP CONSTRAINT "PostLike_single_target";
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_single_target"
CHECK (num_nonnulls("proofId", "checkInUpdateId", "replyId", "reviewId") = 1);
