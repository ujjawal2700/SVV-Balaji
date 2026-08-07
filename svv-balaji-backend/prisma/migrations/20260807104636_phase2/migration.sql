-- CreateEnum
CREATE TYPE "ProcurementPlanStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('APPROVED', 'REJECTED', 'HOLD_FOR_REINSPECTION');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('COLLECTED', 'STORED', 'UNDER_PRODUCTION', 'PACKAGED', 'DISPATCHED', 'DELIVERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'TRANSFER', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "procurement_plans" (
    "id" TEXT NOT NULL,
    "cropName" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "scheduledFrom" TIMESTAMP(3) NOT NULL,
    "scheduledTo" TIMESTAMP(3) NOT NULL,
    "status" "ProcurementPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procurement_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_inspections" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "agreementId" TEXT,
    "procurementPlanId" TEXT,
    "cropName" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "moistureLevel" DECIMAL(5,2),
    "foreignMatter" DECIMAL(5,2),
    "grainSize" TEXT,
    "grainColor" TEXT,
    "smell" TEXT,
    "physicalDamage" TEXT,
    "result" "InspectionResult" NOT NULL,
    "remarks" TEXT,
    "inspectedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvest_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_inspection_documents" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_inspection_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_collections" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cropName" TEXT NOT NULL,
    "collectionDate" TIMESTAMP(3) NOT NULL,
    "collectionLocation" TEXT,
    "grossWeight" DECIMAL(12,2) NOT NULL,
    "netWeight" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "purchaseRate" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "receiptNumber" TEXT NOT NULL,
    "collectedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_material_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_batches" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cropName" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "status" "BatchStatus" NOT NULL DEFAULT 'COLLECTED',
    "warehouseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_material_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_number_counters" (
    "dateKey" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "batch_number_counters_pkey" PRIMARY KEY ("dateKey")
);

-- CreateTable
CREATE TABLE "warehouse_stock" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "reservedQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "storageLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "movementType" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "reason" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procurement_plans_branchId_idx" ON "procurement_plans"("branchId");

-- CreateIndex
CREATE INDEX "procurement_plans_status_idx" ON "procurement_plans"("status");

-- CreateIndex
CREATE INDEX "harvest_inspections_farmerId_idx" ON "harvest_inspections"("farmerId");

-- CreateIndex
CREATE INDEX "harvest_inspections_result_idx" ON "harvest_inspections"("result");

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_collections_inspectionId_key" ON "raw_material_collections"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_collections_receiptNumber_key" ON "raw_material_collections"("receiptNumber");

-- CreateIndex
CREATE INDEX "raw_material_collections_farmerId_idx" ON "raw_material_collections"("farmerId");

-- CreateIndex
CREATE INDEX "raw_material_collections_branchId_idx" ON "raw_material_collections"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_batches_batchNumber_key" ON "raw_material_batches"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_batches_collectionId_key" ON "raw_material_batches"("collectionId");

-- CreateIndex
CREATE INDEX "raw_material_batches_farmerId_idx" ON "raw_material_batches"("farmerId");

-- CreateIndex
CREATE INDEX "raw_material_batches_status_idx" ON "raw_material_batches"("status");

-- CreateIndex
CREATE INDEX "raw_material_batches_warehouseId_idx" ON "raw_material_batches"("warehouseId");

-- CreateIndex
CREATE INDEX "warehouse_stock_warehouseId_idx" ON "warehouse_stock"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_stock_warehouseId_batchId_key" ON "warehouse_stock"("warehouseId", "batchId");

-- CreateIndex
CREATE INDEX "stock_movements_batchId_idx" ON "stock_movements"("batchId");

-- CreateIndex
CREATE INDEX "stock_movements_movementType_idx" ON "stock_movements"("movementType");

-- AddForeignKey
ALTER TABLE "procurement_plans" ADD CONSTRAINT "procurement_plans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_plans" ADD CONSTRAINT "procurement_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_inspections" ADD CONSTRAINT "harvest_inspections_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_inspections" ADD CONSTRAINT "harvest_inspections_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_inspections" ADD CONSTRAINT "harvest_inspections_procurementPlanId_fkey" FOREIGN KEY ("procurementPlanId") REFERENCES "procurement_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_inspections" ADD CONSTRAINT "harvest_inspections_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_inspection_documents" ADD CONSTRAINT "harvest_inspection_documents_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "harvest_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_collections" ADD CONSTRAINT "raw_material_collections_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "harvest_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_collections" ADD CONSTRAINT "raw_material_collections_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_collections" ADD CONSTRAINT "raw_material_collections_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_collections" ADD CONSTRAINT "raw_material_collections_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "raw_material_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_batches" ADD CONSTRAINT "raw_material_batches_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "raw_material_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "raw_material_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
