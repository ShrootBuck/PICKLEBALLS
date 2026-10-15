BEGIN;

-- AlterTable
ALTER TABLE "MediaUpload" ADD COLUMN     "directConversationId" TEXT,
ALTER COLUMN "circleId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DirectConversation" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectReaction" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,

    CONSTRAINT "DirectReaction_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "DirectConversation_userAId_lastMessageAt_idx" ON "DirectConversation"("userAId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "DirectConversation_userBId_lastMessageAt_idx" ON "DirectConversation"("userBId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectConversation_userAId_userBId_key" ON "DirectConversation"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "DirectMessage_conversationId_revision_idx" ON "DirectMessage"("conversationId", "revision");

-- CreateIndex
CREATE INDEX "DirectMessage_recipientId_readAt_idx" ON "DirectMessage"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "DirectMessage_senderId_idx" ON "DirectMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessage_conversationId_sequence_key" ON "DirectMessage"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessage_conversationId_senderId_clientId_key" ON "DirectMessage"("conversationId", "senderId", "clientId");

-- CreateIndex
CREATE INDEX "DirectReaction_userId_idx" ON "DirectReaction"("userId");

-- CreateIndex
CREATE INDEX "MediaUpload_directConversationId_idx" ON "MediaUpload"("directConversationId");

-- AddForeignKey
ALTER TABLE "MediaUpload" ADD CONSTRAINT "MediaUpload_directConversationId_fkey" FOREIGN KEY ("directConversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectReaction" ADD CONSTRAINT "DirectReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectReaction" ADD CONSTRAINT "DirectReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep each chat a unique pair and prevent any upload from crossing scopes.
ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_ordered_pair"
  CHECK ("userAId" COLLATE "C" < "userBId" COLLATE "C");
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_different_users"
  CHECK ("senderId" <> "recipientId");
ALTER TABLE "MediaUpload" ADD CONSTRAINT "MediaUpload_single_scope"
  CHECK (("circleId" IS NULL) <> ("directConversationId" IS NULL));

COMMIT;
