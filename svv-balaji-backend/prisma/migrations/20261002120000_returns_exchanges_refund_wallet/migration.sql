-- Returns & exchanges (per order item), rupee Refund Wallet, damaged-stock bucket.
-- Additive only: new enums/tables/columns, no data rewritten. Generated with
-- prisma migrate diff (schema -> schema), no database used.

-- CreateEnum
CREATE TYPE "ReturnRequestType" AS ENUM ('RETURN', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "ReturnLogistics" AS ENUM ('QUICK_DELIVERY', 'SHIPROCKET');

-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'QC', 'REFUND_INITIATED', 'REPLACEMENT_PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'REJECTED', 'PICKUP_FAILED', 'QC_FAILED', 'DELIVERY_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('WALLET', 'UPI', 'BANK', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "ReturnShippingPayer" AS ENUM ('COMPANY', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "ExchangeLowerPriceAction" AS ENUM ('REFUND_TO_WALLET', 'NO_REFUND');

-- CreateEnum
CREATE TYPE "ExchangeDifferenceStatus" AS ENUM ('NONE', 'PENDING', 'PAID', 'CREDITED', 'WAIVED');

-- CreateEnum
CREATE TYPE "QcDecision" AS ENUM ('ACCEPT', 'REJECT');

-- CreateEnum
CREATE TYPE "ReturnStockDisposition" AS ENUM ('GOOD', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ReturnShipmentDirection" AS ENUM ('REVERSE', 'FORWARD');

-- CreateEnum
CREATE TYPE "RefundWalletReason" AS ENUM ('RETURN_REFUND', 'EXCHANGE_DIFFERENCE_CREDIT', 'ORDER_PAYMENT', 'ORDER_PAYMENT_REVERSAL', 'EXCHANGE_DIFFERENCE_PAYMENT', 'EXCHANGE_DIFFERENCE_REVERSAL', 'MANUAL_ADJUSTMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'RETURN_INWARD';
ALTER TYPE "StockMovementType" ADD VALUE 'RETURN_DAMAGED';

-- AlterEnum
ALTER TYPE "DeliveryTaskKind" ADD VALUE 'REPLACEMENT_DELIVERY';

-- AlterTable
ALTER TABLE "finished_goods_stock" ADD COLUMN     "damagedQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "refundWalletBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "refundWalletPaidInr" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order_returns" ADD COLUMN     "returnRequestId" TEXT;

-- AlterTable
ALTER TABLE "delivery_tasks" ADD COLUMN     "returnRequestId" TEXT;

-- CreateTable
CREATE TABLE "return_settings" (
    "id" TEXT NOT NULL,
    "channel" "SalesChannel" NOT NULL,
    "returnEnabled" BOOLEAN NOT NULL DEFAULT true,
    "exchangeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "returnWindowHours" INTEGER NOT NULL DEFAULT 168,
    "exchangeWindowHours" INTEGER NOT NULL DEFAULT 168,
    "mediaRequired" BOOLEAN NOT NULL DEFAULT false,
    "minMediaCount" INTEGER NOT NULL DEFAULT 1,
    "maxMediaCount" INTEGER NOT NULL DEFAULT 6,
    "qcRequired" BOOLEAN NOT NULL DEFAULT true,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "allowedRefundMethods" "RefundMethod"[] DEFAULT ARRAY['WALLET', 'UPI', 'BANK']::"RefundMethod"[],
    "defaultRefundMethod" "RefundMethod" NOT NULL DEFAULT 'WALLET',
    "returnShippingPayer" "ReturnShippingPayer" NOT NULL DEFAULT 'COMPANY',
    "returnShippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "restockingFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "exchangeSameProductOnly" BOOLEAN NOT NULL DEFAULT true,
    "exchangeSameCategoryOnly" BOOLEAN NOT NULL DEFAULT false,
    "exchangeLowerPriceAction" "ExchangeLowerPriceAction" NOT NULL DEFAULT 'REFUND_TO_WALLET',
    "restockOnQcPass" BOOLEAN NOT NULL DEFAULT true,
    "nonReturnableCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nonReturnableProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nonExchangeableCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nonExchangeableProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policyText" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_reasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "forReturn" BOOLEAN NOT NULL DEFAULT true,
    "forExchange" BOOLEAN NOT NULL DEFAULT true,
    "channel" "SalesChannel",
    "companyFault" BOOLEAN NOT NULL DEFAULT false,
    "requiresMedia" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "type" "ReturnRequestType" NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "channel" "SalesChannel" NOT NULL,
    "logistics" "ReturnLogistics" NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reasonId" TEXT,
    "reasonLabel" TEXT NOT NULL,
    "companyFault" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raisedBy" TEXT NOT NULL DEFAULT 'STOREFRONT',
    "raisedById" TEXT,
    "unitPaid" DECIMAL(14,2) NOT NULL,
    "itemValue" DECIMAL(14,2) NOT NULL,
    "shippingFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "restockingFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loyaltyPointsToRestore" INTEGER NOT NULL DEFAULT 0,
    "referralPointsToRestore" INTEGER NOT NULL DEFAULT 0,
    "refundMethod" "RefundMethod",
    "refundUpiId" TEXT,
    "refundAccountName" TEXT,
    "refundAccountNumber" TEXT,
    "refundIfsc" TEXT,
    "refundBankName" TEXT,
    "refundReference" TEXT,
    "refundNote" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundedById" TEXT,
    "replacementProductId" TEXT,
    "replacementName" TEXT,
    "replacementUnitPrice" DECIMAL(14,2),
    "replacementGstRate" DECIMAL(5,2),
    "replacementTotal" DECIMAL(14,2),
    "priceDifference" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "differenceStatus" "ExchangeDifferenceStatus" NOT NULL DEFAULT 'NONE',
    "differencePaidWallet" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "differenceGatewayOrderId" TEXT,
    "differenceGatewayPaymentId" TEXT,
    "differenceReference" TEXT,
    "replacementReservedAt" TIMESTAMP(3),
    "replacementShippedAt" TIMESTAMP(3),
    "replacementDeliveredAt" TIMESTAMP(3),
    "replacementOtp" TEXT,
    "replacementOtpAttempts" INTEGER NOT NULL DEFAULT 0,
    "pickupOtp" TEXT,
    "pickupOtpAttempts" INTEGER NOT NULL DEFAULT 0,
    "warehouseId" TEXT NOT NULL,
    "qcDecision" "QcDecision",
    "qcGoodQuantity" INTEGER,
    "qcDamagedQuantity" INTEGER,
    "qcNotes" TEXT,
    "qcAt" TIMESTAMP(3),
    "qcById" TEXT,
    "lostInTransit" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedReason" TEXT,
    "pickupScheduledAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "failureReason" TEXT,
    "adminNote" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_request_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "ReturnRequestStatus",
    "toStatus" "ReturnRequestStatus",
    "note" TEXT,
    "actorKind" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_shipments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "direction" "ReturnShipmentDirection" NOT NULL,
    "provider" TEXT NOT NULL,
    "awb" TEXT,
    "courier" TEXT,
    "trackingUrl" TEXT,
    "labelUrl" TEXT,
    "providerRef" TEXT,
    "externalStatus" TEXT NOT NULL DEFAULT 'CREATED',
    "events" JSONB NOT NULL DEFAULT '[]',
    "lastEventAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_batch_lines" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fgBatchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "disposition" "ReturnStockDisposition" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_batch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_replacement_allocations" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fgBatchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_replacement_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_wallet_transactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "reason" "RefundWalletReason" NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "returnRequestId" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_settings_channel_key" ON "return_settings"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "return_reasons_code_key" ON "return_reasons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_requestNumber_key" ON "return_requests"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_differenceGatewayPaymentId_key" ON "return_requests"("differenceGatewayPaymentId");

-- CreateIndex
CREATE INDEX "return_requests_channel_status_idx" ON "return_requests"("channel", "status");

-- CreateIndex
CREATE INDEX "return_requests_orderId_idx" ON "return_requests"("orderId");

-- CreateIndex
CREATE INDEX "return_requests_orderItemId_idx" ON "return_requests"("orderItemId");

-- CreateIndex
CREATE INDEX "return_requests_customerId_idx" ON "return_requests"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_customerId_idempotencyKey_key" ON "return_requests"("customerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "return_request_events_requestId_createdAt_idx" ON "return_request_events"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "return_shipments_awb_idx" ON "return_shipments"("awb");

-- CreateIndex
CREATE INDEX "return_shipments_requestId_idx" ON "return_shipments"("requestId");

-- CreateIndex
CREATE INDEX "return_batch_lines_requestId_idx" ON "return_batch_lines"("requestId");

-- CreateIndex
CREATE INDEX "return_batch_lines_fgBatchId_idx" ON "return_batch_lines"("fgBatchId");

-- CreateIndex
CREATE INDEX "return_replacement_allocations_requestId_idx" ON "return_replacement_allocations"("requestId");

-- CreateIndex
CREATE INDEX "return_replacement_allocations_fgBatchId_idx" ON "return_replacement_allocations"("fgBatchId");

-- CreateIndex
CREATE INDEX "refund_wallet_transactions_customerId_createdAt_idx" ON "refund_wallet_transactions"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "refund_wallet_transactions_orderId_idx" ON "refund_wallet_transactions"("orderId");

-- CreateIndex
CREATE INDEX "refund_wallet_transactions_returnRequestId_idx" ON "refund_wallet_transactions"("returnRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "order_returns_returnRequestId_key" ON "order_returns"("returnRequestId");

-- CreateIndex
CREATE INDEX "delivery_tasks_returnRequestId_idx" ON "delivery_tasks"("returnRequestId");

-- AddForeignKey
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "return_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_replacementProductId_fkey" FOREIGN KEY ("replacementProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_request_events" ADD CONSTRAINT "return_request_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_shipments" ADD CONSTRAINT "return_shipments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_batch_lines" ADD CONSTRAINT "return_batch_lines_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_batch_lines" ADD CONSTRAINT "return_batch_lines_fgBatchId_fkey" FOREIGN KEY ("fgBatchId") REFERENCES "finished_goods_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_replacement_allocations" ADD CONSTRAINT "return_replacement_allocations_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_replacement_allocations" ADD CONSTRAINT "return_replacement_allocations_fgBatchId_fkey" FOREIGN KEY ("fgBatchId") REFERENCES "finished_goods_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_replacement_allocations" ADD CONSTRAINT "return_replacement_allocations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_wallet_transactions" ADD CONSTRAINT "refund_wallet_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_wallet_transactions" ADD CONSTRAINT "refund_wallet_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_wallet_transactions" ADD CONSTRAINT "refund_wallet_transactions_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

