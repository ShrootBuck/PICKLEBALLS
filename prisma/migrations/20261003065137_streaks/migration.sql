-- CreateEnum
CREATE TYPE "StreakKind" AS ENUM ('QUIT', 'BUILD');

-- CreateEnum
CREATE TYPE "StreakVisibility" AS ENUM ('CIRCLE', 'PRIVATE');

-- CreateEnum
CREATE TYPE "StreakStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "StreakEntryKind" AS ENUM ('CLEAN', 'SLIP', 'LOG');

-- CreateEnum
CREATE TYPE "StreakEventKind" AS ENUM ('STARTED', 'MILESTONE', 'RETIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityKind" ADD VALUE 'STREAK_STARTED';
ALTER TYPE "ActivityKind" ADD VALUE 'STREAK_MILESTONE';
ALTER TYPE "ActivityKind" ADD VALUE 'STREAK_RETIRED';
ALTER TYPE "ActivityKind" ADD VALUE 'STREAK_NUDGE';
ALTER TYPE "ActivityKind" ADD VALUE 'STREAK_REMINDER';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "streakEveningHour" INTEGER NOT NULL DEFAULT 23,
ADD COLUMN     "streakMorningHour" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "streakReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "streakWarnings" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PostLike" ADD COLUMN     "streakEventId" TEXT;

-- AlterTable
ALTER TABLE "SocialReply" ADD COLUMN     "streakEventId" TEXT;

-- CreateTable
CREATE TABLE "Streak" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "kind" "StreakKind" NOT NULL,
    "visibility" "StreakVisibility" NOT NULL,
    "status" "StreakStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "dailyCostCents" INTEGER,
    "dailyUnits" INTEGER,
    "unitLabel" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Streak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakEntry" (
    "id" TEXT NOT NULL,
    "streakId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" "StreakEntryKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "costCents" INTEGER,
    "units" INTEGER,
    "note" VARCHAR(280),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakEvent" (
    "id" TEXT NOT NULL,
    "streakId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "kind" "StreakEventKind" NOT NULL,
    "count" INTEGER NOT NULL,
    "costCents" INTEGER,
    "units" INTEGER,
    "dedupeKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakNudge" (
    "streakId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakNudge_pkey" PRIMARY KEY ("streakId","senderId","day")
);

-- CreateIndex
CREATE INDEX "Streak_circleId_status_createdAt_idx" ON "Streak"("circleId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Streak_userId_circleId_status_idx" ON "Streak"("userId", "circleId", "status");

-- CreateIndex
CREATE INDEX "Streak_status_idx" ON "Streak"("status");

-- CreateIndex
CREATE INDEX "StreakEntry_streakId_day_idx" ON "StreakEntry"("streakId", "day");

-- CreateIndex
CREATE INDEX "StreakEvent_circleId_createdAt_idx" ON "StreakEvent"("circleId", "createdAt");

-- CreateIndex
CREATE INDEX "StreakEvent_userId_createdAt_idx" ON "StreakEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreakEvent_streakId_dedupeKey_key" ON "StreakEvent"("streakId", "dedupeKey");

-- CreateIndex
CREATE INDEX "StreakNudge_senderId_idx" ON "StreakNudge"("senderId");

-- CreateIndex
CREATE INDEX "PostLike_streakEventId_idx" ON "PostLike"("streakEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_userId_streakEventId_key" ON "PostLike"("userId", "streakEventId");

-- CreateIndex
CREATE INDEX "SocialReply_streakEventId_createdAt_idx" ON "SocialReply"("streakEventId", "createdAt");

-- AddForeignKey
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakEntry" ADD CONSTRAINT "StreakEntry_streakId_fkey" FOREIGN KEY ("streakId") REFERENCES "Streak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakEvent" ADD CONSTRAINT "StreakEvent_streakId_fkey" FOREIGN KEY ("streakId") REFERENCES "Streak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakEvent" ADD CONSTRAINT "StreakEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakEvent" ADD CONSTRAINT "StreakEvent_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakNudge" ADD CONSTRAINT "StreakNudge_streakId_fkey" FOREIGN KEY ("streakId") REFERENCES "Streak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakNudge" ADD CONSTRAINT "StreakNudge_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_streakEventId_fkey" FOREIGN KEY ("streakEventId") REFERENCES "StreakEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_streakEventId_fkey" FOREIGN KEY ("streakEventId") REFERENCES "StreakEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
