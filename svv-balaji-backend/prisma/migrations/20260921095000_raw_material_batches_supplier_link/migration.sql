-- Reconciles migration history with the database: these changes were already
-- applied directly to this database (outside a migration file) while the
-- supplier module was being built, so raw_material_batches already has them.
-- This file exists so `prisma migrate dev` stops seeing drift; it is recorded
-- via `prisma migrate resolve --applied`, never executed, because the target
-- state already exists.

-- DropForeignKey
ALTER TABLE "raw_material_batches" DROP CONSTRAINT "raw_material_batches_branchId_fkey";

-- DropForeignKey
ALTER TABLE "raw_material_batches" DROP CONSTRAINT "raw_material_batches_collectionId_fkey";

-- DropForeignKey
ALTER TABLE "raw_material_batches" DROP CONSTRAINT "raw_material_batches_farmerId_fkey";

-- AlterTable
ALTER TABLE "raw_material_batches" ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "supplierTransportId" TEXT,
ALTER COLUMN "collectionId" DROP NOT NULL,
ALTER COLUMN "farmerId" DROP NOT NULL,
ALTER COLUMN "branchId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_batches_supplierTransportId_key" ON "raw_material_batches"("supplierTransportId" ASC);

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "raw_material_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_supplierTransportId_fkey" FOREIGN KEY ("supplierTransportId") REFERENCES "supplier_transports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
