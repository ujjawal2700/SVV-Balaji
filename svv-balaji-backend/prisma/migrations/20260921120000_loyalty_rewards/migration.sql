-- CreateEnum
CREATE TYPE "LoyaltyEligibility" AS ENUM ('INHERIT', 'ELIGIBLE', 'NOT_ELIGIBLE');

-- CreateEnum
CREATE TYPE "LoyaltyCalculationBase" AS ENUM ('EXCLUDING_TAX', 'INCLUDING_TAX');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CoinTransactionReason" ADD VALUE 'LOYALTY_EARN';
ALTER TYPE "CoinTransactionReason" ADD VALUE 'LOYALTY_REVERSAL';
ALTER TYPE "CoinTransactionReason" ADD VALUE 'LOYALTY_EXPIRY';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "loyaltyEligibility" "LoyaltyEligibility" NOT NULL DEFAULT 'INHERIT';

-- AlterTable
ALTER TABLE "coin_transactions" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "remainingAmount" INTEGER;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "loyaltyEligibility" "LoyaltyEligibility" NOT NULL DEFAULT 'INHERIT';

-- CreateTable
CREATE TABLE "loyalty_settings" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "earnPercentB2C" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "earnPercentB2B" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "pointValueInr" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "calculationBase" "LoyaltyCalculationBase" NOT NULL DEFAULT 'EXCLUDING_TAX',
    "defaultEligible" BOOLEAN NOT NULL DEFAULT true,
    "appliesToDiscountedProducts" BOOLEAN NOT NULL DEFAULT true,
    "minEligibleItemAmount" DECIMAL(12,2),
    "minEligibleOrderAmount" DECIMAL(12,2),
    "maxRewardPerOrderInr" DECIMAL(12,2),
    "pointsExpiryMonths" INTEGER,
    "earningStartsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_order_earns" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "eligibleAmount" DECIMAL(14,2) NOT NULL,
    "percentApplied" DECIMAL(5,2) NOT NULL,
    "pointValueApplied" DECIMAL(10,4) NOT NULL,
    "calculationBase" "LoyaltyCalculationBase" NOT NULL,
    "rewardInr" DECIMAL(14,2) NOT NULL,
    "points" INTEGER NOT NULL,
    "cappedByMax" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "coinTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_order_earns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_order_earn_lines" (
    "id" TEXT NOT NULL,
    "earnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "ineligibleReason" TEXT,
    "eligibilitySource" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reversedPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "loyalty_order_earn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_returns" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refundAmount" DECIMAL(14,2),
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_returns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_order_earns_orderId_key" ON "loyalty_order_earns"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_order_earns_coinTransactionId_key" ON "loyalty_order_earns"("coinTransactionId");

-- CreateIndex
CREATE INDEX "loyalty_order_earns_customerId_idx" ON "loyalty_order_earns"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_order_earn_lines_orderItemId_key" ON "loyalty_order_earn_lines"("orderItemId");

-- CreateIndex
CREATE INDEX "loyalty_order_earn_lines_earnId_idx" ON "loyalty_order_earn_lines"("earnId");

-- CreateIndex
CREATE INDEX "order_returns_orderId_idx" ON "order_returns"("orderId");

-- CreateIndex
CREATE INDEX "order_returns_orderItemId_idx" ON "order_returns"("orderItemId");

-- CreateIndex
CREATE INDEX "coin_transactions_reason_expiresAt_idx" ON "coin_transactions"("reason", "expiresAt");

-- AddForeignKey
ALTER TABLE "loyalty_settings" ADD CONSTRAINT "loyalty_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_order_earns" ADD CONSTRAINT "loyalty_order_earns_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_order_earn_lines" ADD CONSTRAINT "loyalty_order_earn_lines_earnId_fkey" FOREIGN KEY ("earnId") REFERENCES "loyalty_order_earns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_order_earn_lines" ADD CONSTRAINT "loyalty_order_earn_lines_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

