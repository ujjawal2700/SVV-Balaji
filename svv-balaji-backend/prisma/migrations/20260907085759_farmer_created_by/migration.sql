-- DropForeignKey
ALTER TABLE "production_batches" DROP CONSTRAINT "production_batches_warehouseId_fkey";

-- DropIndex
DROP INDEX "production_batches_warehouseId_idx";

-- AlterTable
ALTER TABLE "farmers" ADD COLUMN     "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
