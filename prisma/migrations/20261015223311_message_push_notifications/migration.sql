-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "directMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "groupMessages" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MessagePushDelivery" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagePushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagePushDelivery_completedAt_nextAttemptAt_idx" ON "MessagePushDelivery"("completedAt", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MessagePushDelivery_recipientId_idx" ON "MessagePushDelivery"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagePushDelivery_messageId_recipientId_key" ON "MessagePushDelivery"("messageId", "recipientId");

-- AddForeignKey
ALTER TABLE "MessagePushDelivery" ADD CONSTRAINT "MessagePushDelivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagePushDelivery" ADD CONSTRAINT "MessagePushDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
