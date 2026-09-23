-- AlterTable
ALTER TABLE "checkout_sessions" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_customerId_idempotencyKey_key" ON "checkout_sessions"("customerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_gatewayPaymentId_key" ON "payment_transactions"("gatewayPaymentId");
