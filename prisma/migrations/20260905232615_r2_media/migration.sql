-- AlterTable
ALTER TABLE "SocialReply" ADD COLUMN     "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TaskProof" ADD COLUMN     "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TaskProofImage" ADD COLUMN     "objectKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MediaUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_objectKey_key" ON "MediaUpload"("objectKey");

-- CreateIndex
CREATE INDEX "MediaUpload_ownerId_circleId_idx" ON "MediaUpload"("ownerId", "circleId");
