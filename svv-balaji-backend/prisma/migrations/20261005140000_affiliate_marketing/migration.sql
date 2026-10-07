-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AffiliatePayoutMethod" AS ENUM ('UPI', 'BANK');

-- CreateEnum
CREATE TYPE "AffiliateCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AffiliateAttributionStatus" AS ENUM ('ATTRIBUTED', 'FRAUD', 'NO_COMMISSION');

-- CreateEnum
CREATE TYPE "AffiliateAdjustmentKind" AS ENUM ('RETURN', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "AffiliateHoldFrom" AS ENUM ('ORDER_DATE', 'DELIVERY_DATE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentFingerprints" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "checkout_sessions" ADD COLUMN     "affiliateClickId" TEXT;

-- CreateTable
CREATE TABLE "affiliate_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cookieDays" INTEGER NOT NULL DEFAULT 30,
    "holdDays" INTEGER NOT NULL DEFAULT 7,
    "holdFrom" "AffiliateHoldFrom" NOT NULL DEFAULT 'ORDER_DATE',
    "defaultRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "applyToB2B" BOOLEAN NOT NULL DEFAULT false,
    "minPayoutAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "termsText" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_category_rates" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_category_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "customerAccountId" TEXT NOT NULL,
    "customerId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "promotionUrl" TEXT,
    "audienceSize" TEXT,
    "promotionPlan" TEXT,
    "pan" TEXT,
    "payoutMethod" "AffiliatePayoutMethod" NOT NULL DEFAULT 'UPI',
    "payoutUpiId" TEXT,
    "payoutAccountName" TEXT,
    "payoutAccountNumber" TEXT,
    "payoutIfsc" TEXT,
    "payoutBankName" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_clicks" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "landingPath" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_attributions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "clickId" TEXT,
    "status" "AffiliateAttributionStatus" NOT NULL,
    "fraudReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fraudDetail" TEXT,
    "baseTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_commissions" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "couponShare" DECIMAL(14,2) NOT NULL,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "rateSource" TEXT NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "refundedQuantity" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "AffiliateCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "payoutId" TEXT,
    "paidAt" TIMESTAMP(3),
    "statusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_commission_adjustments" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "kind" "AffiliateAdjustmentKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "orderReturnId" TEXT,
    "clawback" BOOLEAN NOT NULL DEFAULT false,
    "recoveredInPayoutId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_commission_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_payouts" (
    "id" TEXT NOT NULL,
    "payoutNumber" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "clawbackAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "commissionCount" INTEGER NOT NULL,
    "method" "AffiliatePayoutMethod" NOT NULL,
    "paidTo" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "paidById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_category_rates_categoryId_key" ON "affiliate_category_rates"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_code_key" ON "affiliates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_customerAccountId_key" ON "affiliates"("customerAccountId");

-- CreateIndex
CREATE INDEX "affiliates_status_idx" ON "affiliates"("status");

-- CreateIndex
CREATE INDEX "affiliate_clicks_affiliateId_createdAt_idx" ON "affiliate_clicks"("affiliateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_attributions_orderId_key" ON "affiliate_attributions"("orderId");

-- CreateIndex
CREATE INDEX "affiliate_attributions_affiliateId_createdAt_idx" ON "affiliate_attributions"("affiliateId", "createdAt");

-- CreateIndex
CREATE INDEX "affiliate_attributions_status_idx" ON "affiliate_attributions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commissions_orderItemId_key" ON "affiliate_commissions"("orderItemId");

-- CreateIndex
CREATE INDEX "affiliate_commissions_affiliateId_status_idx" ON "affiliate_commissions"("affiliateId", "status");

-- CreateIndex
CREATE INDEX "affiliate_commissions_status_releaseDate_idx" ON "affiliate_commissions"("status", "releaseDate");

-- CreateIndex
CREATE INDEX "affiliate_commissions_orderId_idx" ON "affiliate_commissions"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_commission_adjustments_orderReturnId_key" ON "affiliate_commission_adjustments"("orderReturnId");

-- CreateIndex
CREATE INDEX "affiliate_commission_adjustments_affiliateId_clawback_idx" ON "affiliate_commission_adjustments"("affiliateId", "clawback");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_payouts_payoutNumber_key" ON "affiliate_payouts"("payoutNumber");

-- CreateIndex
CREATE INDEX "affiliate_payouts_affiliateId_paidAt_idx" ON "affiliate_payouts"("affiliateId", "paidAt");

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_affiliateClickId_fkey" FOREIGN KEY ("affiliateClickId") REFERENCES "affiliate_clicks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_category_rates" ADD CONSTRAINT "affiliate_category_rates_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_clickId_fkey" FOREIGN KEY ("clickId") REFERENCES "affiliate_clicks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "affiliate_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commission_adjustments" ADD CONSTRAINT "affiliate_commission_adjustments_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "affiliate_commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commission_adjustments" ADD CONSTRAINT "affiliate_commission_adjustments_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_commission_adjustments" ADD CONSTRAINT "affiliate_commission_adjustments_recoveredInPayoutId_fkey" FOREIGN KEY ("recoveredInPayoutId") REFERENCES "affiliate_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

