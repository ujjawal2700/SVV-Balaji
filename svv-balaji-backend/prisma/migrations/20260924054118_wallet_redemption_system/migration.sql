/*
  Warnings:

  - Added the required column `source` to the `coin_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CoinSource" AS ENUM ('REFERRAL', 'LOYALTY');

-- CreateEnum
CREATE TYPE "WalletRedemptionMode" AS ENUM ('SEPARATE', 'COMBINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CoinTransactionReason" ADD VALUE 'REFERRAL_REDEMPTION';
ALTER TYPE "CoinTransactionReason" ADD VALUE 'REFERRAL_REDEMPTION_REFUND';

-- AlterTable
-- Added nullable first and backfilled below, because ADD COLUMN ... NOT NULL
-- with no default fails outright once the table has rows (which it does on
-- every environment past a fresh DB).
ALTER TABLE "coin_transactions" ADD COLUMN     "source" "CoinSource";

-- Backfill: every existing row's reason maps to exactly one source - the two
-- REFERRAL_* reasons to REFERRAL, everything else (all LOYALTY_* reasons,
-- plus pre-existing MANUAL_ADJUSTMENT rows, which historically only ever
-- corrected loyalty balances) to LOYALTY.
UPDATE "coin_transactions"
SET "source" = CASE
  WHEN "reason" IN ('REFERRAL_REFERRER_REWARD', 'REFERRAL_REFEREE_REWARD') THEN 'REFERRAL'::"CoinSource"
  ELSE 'LOYALTY'::"CoinSource"
END
WHERE "source" IS NULL;

ALTER TABLE "coin_transactions" ALTER COLUMN "source" SET NOT NULL;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "loyaltyCoinBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralCoinBalance" INTEGER NOT NULL DEFAULT 0;

-- Backfill the new per-pool balances from the ledger so they agree with the
-- existing coinBalance total (referralCoinBalance + loyaltyCoinBalance must
-- equal coinBalance for every customer after this migration).
UPDATE "customers" c
SET "referralCoinBalance" = COALESCE(agg."referral", 0),
    "loyaltyCoinBalance"  = COALESCE(agg."loyalty", 0)
FROM (
  SELECT
    "customerId",
    SUM(CASE WHEN "source" = 'REFERRAL' THEN "amount" ELSE 0 END) AS "referral",
    SUM(CASE WHEN "source" = 'LOYALTY' THEN "amount" ELSE 0 END) AS "loyalty"
  FROM "coin_transactions"
  GROUP BY "customerId"
) agg
WHERE agg."customerId" = c."id";

-- AlterTable
ALTER TABLE "referral_settings" ADD COLUMN     "maxRedemptionPercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "minRedeemPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointValueInr" DECIMAL(10,4) NOT NULL DEFAULT 1,
ADD COLUMN     "pointsExpiryMonths" INTEGER,
ADD COLUMN     "redemptionEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "wallet_settings" (
    "id" TEXT NOT NULL,
    "redemptionMode" "WalletRedemptionMode" NOT NULL DEFAULT 'SEPARATE',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coin_transactions_customerId_source_idx" ON "coin_transactions"("customerId", "source");

-- AddForeignKey
ALTER TABLE "wallet_settings" ADD CONSTRAINT "wallet_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
