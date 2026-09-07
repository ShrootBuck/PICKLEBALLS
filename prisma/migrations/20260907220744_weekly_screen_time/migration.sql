/*
  Warnings:

  - A unique constraint covering the columns `[dedupeKey]` on the table `Notification` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AIFeature" ADD VALUE 'SCREEN_TIME_EXTRACTION';

-- AlterEnum
ALTER TYPE "ActivityKind" ADD VALUE 'SCREEN_TIME_REMINDER';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "screenTime" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ScreenTimeReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "dailyAverageMinutes" INTEGER NOT NULL,
    "totalMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenTimeReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenTimeSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "readingId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenTimeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScreenTimeReading_mediaId_key" ON "ScreenTimeReading"("mediaId");

-- CreateIndex
CREATE INDEX "ScreenTimeReading_userId_circleId_weekStart_idx" ON "ScreenTimeReading"("userId", "circleId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenTimeSubmission_readingId_key" ON "ScreenTimeSubmission"("readingId");

-- CreateIndex
CREATE INDEX "ScreenTimeSubmission_circleId_weekStart_idx" ON "ScreenTimeSubmission"("circleId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenTimeSubmission_userId_circleId_weekStart_key" ON "ScreenTimeSubmission"("userId", "circleId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- AddForeignKey
ALTER TABLE "ScreenTimeReading" ADD CONSTRAINT "ScreenTimeReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenTimeReading" ADD CONSTRAINT "ScreenTimeReading_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenTimeSubmission" ADD CONSTRAINT "ScreenTimeSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenTimeSubmission" ADD CONSTRAINT "ScreenTimeSubmission_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenTimeSubmission" ADD CONSTRAINT "ScreenTimeSubmission_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "ScreenTimeReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;
