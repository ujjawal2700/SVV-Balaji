-- Client decision 10 Oct 2026: production cost = raw + labour + machine + loss + other,
-- and machine utilisation = machine list + runs.

-- AlterTable
ALTER TABLE "production_batches" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "costPerUnit" DECIMAL(14,4),
ADD COLUMN     "costRecordedAt" TIMESTAMP(3),
ADD COLUMN     "costRecordedById" TEXT,
ADD COLUMN     "labourCost" DECIMAL(14,2),
ADD COLUMN     "lossCost" DECIMAL(14,2),
ADD COLUMN     "machineCost" DECIMAL(14,2),
ADD COLUMN     "machineId" TEXT,
ADD COLUMN     "otherCosts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "rawMaterialCost" DECIMAL(14,2),
ADD COLUMN     "rawMaterialCostOverridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "totalCost" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineNumber" TEXT,
    "productionLine" TEXT,
    "branchId" TEXT NOT NULL,
    "capacityPerHour" DECIMAL(12,2),
    "hoursPerDay" DECIMAL(4,1) NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machines_code_key" ON "machines"("code");

-- CreateIndex
CREATE INDEX "machines_branchId_isActive_idx" ON "machines"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "production_batches_machineId_startedAt_idx" ON "production_batches"("machineId", "startedAt");

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No backfill of startedAt / completedAt: runs before today count as runs, but
-- their hours read as "not captured" rather than an invented figure.
