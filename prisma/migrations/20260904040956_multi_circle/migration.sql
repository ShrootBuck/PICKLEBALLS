-- DropIndex
DROP INDEX "Membership_userId_key";

-- AlterTable
ALTER TABLE "Circle" ALTER COLUMN "slug" DROP DEFAULT,
ALTER COLUMN "name" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
