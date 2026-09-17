-- AlterTable
ALTER TABLE "CheckInUpdate" ADD COLUMN     "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
