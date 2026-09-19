-- AlterTable
ALTER TABLE "price_lists" ADD COLUMN     "tierTotal" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "b2bTiersAreTotals" BOOLEAN NOT NULL DEFAULT false;

