-- AlterTable
ALTER TABLE "ScreenTimeReceipt" ADD COLUMN     "comparisonPercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ScreenTimeReceiptImage" (
    "receiptId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenTimeReceiptImage_pkey" PRIMARY KEY ("receiptId")
);

-- AddForeignKey
ALTER TABLE "ScreenTimeReceiptImage" ADD CONSTRAINT "ScreenTimeReceiptImage_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "ScreenTimeReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
