-- CreateEnum
CREATE TYPE "CreditPeriodStart" AS ENUM ('DISPATCH', 'ORDER_DATE');

-- CreateEnum
CREATE TYPE "ReceiptMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- AlterTable
ALTER TABLE "checkout_settings" ADD COLUMN     "creditPeriodStart" "CreditPeriodStart" NOT NULL DEFAULT 'DISPATCH';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "credit_receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "ReceiptMethod" NOT NULL,
    "reference" TEXT,
    "receivedOn" DATE NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_receipt_allocations" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_receipts_receiptNumber_key" ON "credit_receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "credit_receipts_customerId_receivedOn_idx" ON "credit_receipts"("customerId", "receivedOn");

-- CreateIndex
CREATE INDEX "credit_receipt_allocations_orderId_idx" ON "credit_receipt_allocations"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_receipt_allocations_receiptId_orderId_key" ON "credit_receipt_allocations"("receiptId", "orderId");

-- AddForeignKey
ALTER TABLE "credit_receipts" ADD CONSTRAINT "credit_receipts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_receipts" ADD CONSTRAINT "credit_receipts_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_receipts" ADD CONSTRAINT "credit_receipts_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_receipt_allocations" ADD CONSTRAINT "credit_receipt_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "credit_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_receipt_allocations" ADD CONSTRAINT "credit_receipt_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
