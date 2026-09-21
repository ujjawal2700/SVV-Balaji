-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'PRODUCTION_INWARD';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "reference" TEXT;
