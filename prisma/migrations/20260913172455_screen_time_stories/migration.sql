/*
  Warnings:

  - A unique constraint covering the columns `[viewerId,screenTimeReadingId,frame]` on the table `StoryView` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StoryView" ADD COLUMN     "screenTimeReadingId" TEXT;

-- Screen-time stories have one frame and share the same exclusive target rule.
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_exactly_one_target";
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_exactly_one_target"
  CHECK (num_nonnulls("proofId", "checkInUpdateId", "screenTimeReadingId") = 1);
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_valid_frame";
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_valid_frame"
  CHECK ("frame" >= 0 AND (("checkInUpdateId" IS NULL AND "screenTimeReadingId" IS NULL) OR "frame" = 0));

-- CreateIndex
CREATE INDEX "StoryView_screenTimeReadingId_idx" ON "StoryView"("screenTimeReadingId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_viewerId_screenTimeReadingId_frame_key" ON "StoryView"("viewerId", "screenTimeReadingId", "frame");

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_screenTimeReadingId_fkey" FOREIGN KEY ("screenTimeReadingId") REFERENCES "ScreenTimeReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;
