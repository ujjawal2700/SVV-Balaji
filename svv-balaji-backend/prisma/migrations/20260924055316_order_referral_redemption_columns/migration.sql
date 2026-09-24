-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "referralRedeemedInr" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "referralRedeemedPoints" INTEGER NOT NULL DEFAULT 0;
