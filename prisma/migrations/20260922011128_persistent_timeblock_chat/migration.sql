-- CreateTable
CREATE TABLE "TimeblockChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "runId" TEXT,
    "runExpiresAt" TIMESTAMP(3),
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeblockChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeblockChatAttachment" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeblockChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeblockChat_userId_key" ON "TimeblockChat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeblockChatAttachment_objectKey_key" ON "TimeblockChatAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "TimeblockChatAttachment_chatId_idx" ON "TimeblockChatAttachment"("chatId");

-- AddForeignKey
ALTER TABLE "TimeblockChat" ADD CONSTRAINT "TimeblockChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeblockChatAttachment" ADD CONSTRAINT "TimeblockChatAttachment_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TimeblockChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
