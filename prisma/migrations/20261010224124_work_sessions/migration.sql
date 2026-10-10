BEGIN;

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "runningUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkSession_state_check" CHECK (
      ("endedAt" IS NULL AND "runningUserId" IS NOT NULL AND "runningUserId" = "userId")
      OR ("endedAt" IS NOT NULL AND "runningUserId" IS NULL AND "endedAt" > "startedAt")
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkSession_runningUserId_key" ON "WorkSession"("runningUserId");

-- CreateIndex
CREATE INDEX "WorkSession_userId_circleId_startedAt_idx" ON "WorkSession"("userId", "circleId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkSession_commitmentId_startedAt_idx" ON "WorkSession"("commitmentId", "startedAt");

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
