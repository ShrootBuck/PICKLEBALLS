-- CreateTable
CREATE TABLE "StoryView" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "proofId" TEXT,
    "checkInUpdateId" TEXT,
    "frame" INTEGER NOT NULL DEFAULT 0,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoryView_exactly_one_target" CHECK (num_nonnulls("proofId", "checkInUpdateId") = 1),
    CONSTRAINT "StoryView_valid_frame" CHECK ("frame" >= 0 AND ("checkInUpdateId" IS NULL OR "frame" = 0))
);

-- CreateIndex
CREATE INDEX "StoryView_circleId_viewerId_viewedAt_idx" ON "StoryView"("circleId", "viewerId", "viewedAt");

-- CreateIndex
CREATE INDEX "StoryView_proofId_idx" ON "StoryView"("proofId");

-- CreateIndex
CREATE INDEX "StoryView_checkInUpdateId_idx" ON "StoryView"("checkInUpdateId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_viewerId_proofId_frame_key" ON "StoryView"("viewerId", "proofId", "frame");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_viewerId_checkInUpdateId_frame_key" ON "StoryView"("viewerId", "checkInUpdateId", "frame");

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "TaskProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_checkInUpdateId_fkey" FOREIGN KEY ("checkInUpdateId") REFERENCES "CheckInUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
