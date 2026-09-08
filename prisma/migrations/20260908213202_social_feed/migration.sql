-- AlterTable
ALTER TABLE "SocialReply" ADD COLUMN     "checkInUpdateId" TEXT;

-- CreateTable
CREATE TABLE "PostLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "proofId" TEXT,
    "checkInUpdateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostLike_circleId_idx" ON "PostLike"("circleId");

-- CreateIndex
CREATE INDEX "PostLike_proofId_idx" ON "PostLike"("proofId");

-- CreateIndex
CREATE INDEX "PostLike_checkInUpdateId_idx" ON "PostLike"("checkInUpdateId");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_userId_proofId_key" ON "PostLike"("userId", "proofId");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_userId_checkInUpdateId_key" ON "PostLike"("userId", "checkInUpdateId");

-- CreateIndex
CREATE INDEX "CheckInUpdate_circleId_createdAt_id_idx" ON "CheckInUpdate"("circleId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SocialReply_checkInUpdateId_createdAt_idx" ON "SocialReply"("checkInUpdateId", "createdAt");

-- AddForeignKey
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_checkInUpdateId_fkey" FOREIGN KEY ("checkInUpdateId") REFERENCES "CheckInUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "TaskProof"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_checkInUpdateId_fkey" FOREIGN KEY ("checkInUpdateId") REFERENCES "CheckInUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep legacy daily discussions while allowing replies to individual updates.
ALTER TABLE "SocialReply" DROP CONSTRAINT "SocialReply_single_target";
ALTER TABLE "SocialReply" ADD CONSTRAINT "SocialReply_single_target"
  CHECK (num_nonnulls("commitmentId", "checkInId", "checkInUpdateId", "proofId", "reviewId") = 1);
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_single_target"
  CHECK (num_nonnulls("proofId", "checkInUpdateId") = 1);

-- Only pre-history check-ins need an update. Keep the original visible time;
-- existing comments remain on their original daily discussion.
INSERT INTO "CheckInUpdate" ("id", "checkInId", "userId", "circleId", "day", "signal", "blocker", "createdAt")
SELECT 'legacy_' || c."id", c."id", c."userId", c."circleId", c."day", c."signal", c."blocker", c."updatedAt"
FROM "CheckIn" c
WHERE NOT EXISTS (SELECT 1 FROM "CheckInUpdate" u WHERE u."checkInId" = c."id");
