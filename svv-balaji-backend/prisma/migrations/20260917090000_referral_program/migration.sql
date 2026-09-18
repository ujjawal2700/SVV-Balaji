-- Refer-a-friend program.
--
-- customers.referralCode is added nullable, backfilled, then locked to
-- NOT NULL + UNIQUE, because customers already has live rows (unlike the
-- product_catalogue_fields / catalog_taxonomy_inventory migrations, which
-- landed against empty tables). The backfilled code is derived from each
-- row's own id, which is already unique, so no collision handling is needed
-- even against a larger table in another environment.

-- AlterTable
ALTER TABLE "customer_accounts" ADD COLUMN     "referralCode" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "referralCode" TEXT;

-- Backfill existing rows before the column is locked down.
UPDATE "customers"
SET "referralCode" = 'SVV' || upper(substr(md5(id::text), 1, 8))
WHERE "referralCode" IS NULL;

ALTER TABLE "customers" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referrals_refereeId_key" ON "referrals"("refereeId");

-- CreateIndex
CREATE INDEX "referrals_referrerId_idx" ON "referrals"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_referralCode_key" ON "customers"("referralCode");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
