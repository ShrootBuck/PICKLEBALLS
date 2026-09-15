/*
  Warnings:

  - You are about to drop the `StoryView` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_checkInUpdateId_fkey";

-- DropForeignKey
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_circleId_fkey";

-- DropForeignKey
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_proofId_fkey";

-- DropForeignKey
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_screenTimeReadingId_fkey";

-- DropForeignKey
ALTER TABLE "StoryView" DROP CONSTRAINT "StoryView_viewerId_fkey";

-- AlterTable
ALTER TABLE "CheckInUpdate" ADD COLUMN     "feelings" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "journal" VARCHAR(5000),
ADD COLUMN     "mood" INTEGER;

-- DropTable
DROP TABLE "StoryView";
