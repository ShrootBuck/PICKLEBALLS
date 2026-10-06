-- AlterTable
ALTER TABLE "PostLike" ADD COLUMN     "screenTimeSubmissionId" TEXT;

-- AlterTable
ALTER TABLE "SocialReply" ADD COLUMN     "screenTimeSubmissionId" TEXT;

-- CreateIndex
CREATE INDEX "PostLike_screenTimeSubmissionId_idx" ON "PostLike"("screenTimeSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_userId_screenTimeSubmissionId_key" ON "PostLike"("userId", "screenTimeSubmissionId");

-- CreateIndex
CREATE INDEX "SocialReply_screenTimeSubmissionId_createdAt_idx" ON "SocialReply"("screenTimeSubmissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_screenTimeSubmissionId_fkey" FOREIGN KEY ("screenTimeSubmissionId") REFERENCES "ScreenTimeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_screenTimeSubmissionId_fkey" FOREIGN KEY ("screenTimeSubmissionId") REFERENCES "ScreenTimeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Screen-time posts are a new like and comment target.
ALTER TABLE "PostLike" DROP CONSTRAINT "PostLike_single_target";
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_single_target"
CHECK (num_nonnulls("proofId", "checkInUpdateId", "replyId", "reviewId", "streakEventId", "screenTimeSubmissionId") = 1);

ALTER TABLE "SocialReply" DROP CONSTRAINT "SocialReply_single_target";
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_single_target"
  CHECK (num_nonnulls("commitmentId", "checkInId", "checkInUpdateId", "proofId", "reviewId", "bucketItemId", "streakEventId", "screenTimeSubmissionId") = 1);
