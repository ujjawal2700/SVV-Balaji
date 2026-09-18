-- Super Admin referral reporting: links a coin transaction back to the
-- qualifying order and the staff member behind a manual adjustment, plus the
-- MANUAL_ADJUSTMENT reason itself. Purely additive, no backfill needed.

-- AlterEnum
ALTER TYPE "CoinTransactionReason" ADD VALUE 'MANUAL_ADJUSTMENT';

-- AlterTable
ALTER TABLE "coin_transactions" ADD COLUMN     "note" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "performedById" TEXT;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

