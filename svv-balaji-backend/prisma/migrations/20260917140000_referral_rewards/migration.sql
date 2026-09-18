-- Referral & Reward Settings: purely additive (all new columns default or
-- nullable), so no backfill is needed - unlike the referral_program
-- migration, which added a required unique column to a non-empty table.

-- CreateEnum
CREATE TYPE "ReferralRewardTrigger" AS ENUM ('REGISTRATION', 'ACCOUNT_VERIFICATION', 'FIRST_ORDER', 'FIRST_DELIVERY');

-- CreateEnum
CREATE TYPE "CoinTransactionReason" AS ENUM ('REFERRAL_REFERRER_REWARD', 'REFERRAL_REFEREE_REWARD');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "coinBalance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "rewardedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "referral_settings" (
    "id" TEXT NOT NULL,
    "referrerRewardCoins" INTEGER NOT NULL DEFAULT 100,
    "refereeRewardCoins" INTEGER NOT NULL DEFAULT 50,
    "rewardTrigger" "ReferralRewardTrigger" NOT NULL DEFAULT 'REGISTRATION',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "CoinTransactionReason" NOT NULL,
    "referralId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coin_transactions_customerId_idx" ON "coin_transactions"("customerId");

-- AddForeignKey
ALTER TABLE "referral_settings" ADD CONSTRAINT "referral_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

