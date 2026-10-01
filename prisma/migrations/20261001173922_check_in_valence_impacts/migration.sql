-- AlterTable
ALTER TABLE "CheckInUpdate" ADD COLUMN     "impacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "prompt" VARCHAR(200),
ADD COLUMN     "valence" INTEGER;
