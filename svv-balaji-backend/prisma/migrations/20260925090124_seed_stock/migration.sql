-- CreateEnum
CREATE TYPE "SeedStockMovementType" AS ENUM ('RECEIPT', 'DISTRIBUTION', 'DISTRIBUTION_REVERSAL', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "seed_distributions" ADD COLUMN     "seedStockId" TEXT;

-- CreateTable
CREATE TABLE "seed_stock" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "seedName" TEXT NOT NULL,
    "seedVariety" TEXT,
    "batchNumber" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "quantityOnHand" DECIMAL(12,2) NOT NULL,
    "supplier" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seed_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seed_stock_movements" (
    "id" TEXT NOT NULL,
    "seedStockId" TEXT NOT NULL,
    "type" "SeedStockMovementType" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "seedDistributionId" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seed_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seed_stock_branchId_isActive_idx" ON "seed_stock"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "seed_stock_movements_seedStockId_createdAt_idx" ON "seed_stock_movements"("seedStockId", "createdAt");

-- CreateIndex
CREATE INDEX "seed_stock_movements_seedDistributionId_idx" ON "seed_stock_movements"("seedDistributionId");

-- CreateIndex
CREATE INDEX "seed_distributions_seedStockId_idx" ON "seed_distributions"("seedStockId");

-- AddForeignKey
ALTER TABLE "seed_distributions" ADD CONSTRAINT "seed_distributions_seedStockId_fkey" FOREIGN KEY ("seedStockId") REFERENCES "seed_stock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seed_stock" ADD CONSTRAINT "seed_stock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seed_stock" ADD CONSTRAINT "seed_stock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seed_stock_movements" ADD CONSTRAINT "seed_stock_movements_seedStockId_fkey" FOREIGN KEY ("seedStockId") REFERENCES "seed_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seed_stock_movements" ADD CONSTRAINT "seed_stock_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
