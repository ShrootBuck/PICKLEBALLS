-- CreateTable
CREATE TABLE "StreakSchedule" (
    "streakId" TEXT NOT NULL,
    "fromDay" DATE NOT NULL,
    "weekdays" INTEGER[],

    CONSTRAINT "StreakSchedule_pkey" PRIMARY KEY ("streakId","fromDay")
);

-- CreateTable
CREATE TABLE "StreakBreak" (
    "id" TEXT NOT NULL,
    "streakId" TEXT NOT NULL,
    "startDay" DATE NOT NULL,
    "resumeDay" DATE,

    CONSTRAINT "StreakBreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StreakBreak_streakId_startDay_idx" ON "StreakBreak"("streakId", "startDay");

-- AddForeignKey
ALTER TABLE "StreakSchedule" ADD CONSTRAINT "StreakSchedule_streakId_fkey" FOREIGN KEY ("streakId") REFERENCES "Streak"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakBreak" ADD CONSTRAINT "StreakBreak_streakId_fkey" FOREIGN KEY ("streakId") REFERENCES "Streak"("id") ON DELETE CASCADE ON UPDATE CASCADE;
