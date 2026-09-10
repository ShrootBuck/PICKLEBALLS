-- AlterTable
ALTER TABLE "MediaUpload" ADD COLUMN     "duration" DOUBLE PRECISION,
ADD COLUMN     "encodeAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pendingProofId" TEXT,
ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "processingError" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "uploadId" TEXT,
ADD COLUMN     "uploadedAt" TIMESTAMP(3),
ALTER COLUMN "sizeBytes" SET DATA TYPE BIGINT;

-- CreateTable
CREATE TABLE "PendingProof" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "mediaIds" TEXT[],
    "note" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proofId" TEXT,
    "error" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "attempt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PendingProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingProof_proofId_key" ON "PendingProof"("proofId");

-- CreateIndex
CREATE INDEX "PendingProof_ownerId_circleId_dismissed_idx" ON "PendingProof"("ownerId", "circleId", "dismissed");

-- CreateIndex
CREATE INDEX "PendingProof_commitmentId_idx" ON "PendingProof"("commitmentId");
