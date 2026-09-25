-- CreateEnum
CREATE TYPE "SeedSource" AS ENUM ('COMPANY_STOCK', 'EXTERNAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SeedStockMovementType" ADD VALUE 'WRITE_OFF';
ALTER TYPE "SeedStockMovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "SeedStockMovementType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "SeedStockMovementType" ADD VALUE 'LOT_UPDATE';

-- AlterTable
ALTER TABLE "seed_distributions" ADD COLUMN     "seedSource" "SeedSource";

-- AlterTable
ALTER TABLE "seed_stock_movements" ADD COLUMN     "relatedSeedStockId" TEXT;

-- Backfill: a handout issued from a lot is company stock. Handouts with no lot
-- were recorded before the source was captured; they stay NULL ("not recorded")
-- rather than being assumed external - nobody said where that seed came from.
UPDATE "seed_distributions" SET "seedSource" = 'COMPANY_STOCK' WHERE "seedStockId" IS NOT NULL;
