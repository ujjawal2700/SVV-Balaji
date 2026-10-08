-- CreateEnum
CREATE TYPE "RiderPayoutMethod" AS ENUM ('BANK_TRANSFER', 'UPI', 'CASH');

-- CreateEnum
CREATE TYPE "RiderPayoutStatus" AS ENUM ('PAID', 'VOIDED');

-- AlterTable
ALTER TABLE "rider_earnings" ADD COLUMN     "payoutId" TEXT;

-- CreateTable
CREATE TABLE "rider_payouts" (
    "id" TEXT NOT NULL,
    "payoutNumber" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "upTo" TIMESTAMP(3) NOT NULL,
    "status" "RiderPayoutStatus" NOT NULL DEFAULT 'PAID',
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "cashOffset" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPaid" DECIMAL(14,2) NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "method" "RiderPayoutMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rider_payouts_payoutNumber_key" ON "rider_payouts"("payoutNumber");

-- CreateIndex
CREATE INDEX "rider_payouts_riderId_paidAt_idx" ON "rider_payouts"("riderId", "paidAt");

-- CreateIndex
CREATE INDEX "rider_payouts_status_idx" ON "rider_payouts"("status");

-- CreateIndex
CREATE INDEX "rider_earnings_payoutId_idx" ON "rider_earnings"("payoutId");

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "rider_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_payouts" ADD CONSTRAINT "rider_payouts_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_payouts" ADD CONSTRAINT "rider_payouts_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_payouts" ADD CONSTRAINT "rider_payouts_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

