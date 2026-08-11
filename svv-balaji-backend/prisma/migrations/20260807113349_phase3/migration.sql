-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductionType" AS ENUM ('SINGLE_GRAIN', 'MULTI_GRAIN');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionStage" AS ENUM ('RAW_MATERIAL', 'IN_PROCESS', 'FINISHED_GOODS');

-- CreateEnum
CREATE TYPE "QualityResult" AS ENUM ('PASS', 'FAIL', 'REWORK_REQUIRED');

-- CreateTable
CREATE TABLE "cleaning_grading_records" (
    "id" TEXT NOT NULL,
    "rawMaterialBatchId" TEXT NOT NULL,
    "dustRemoved" BOOLEAN NOT NULL DEFAULT false,
    "stonesRemoved" BOOLEAN NOT NULL DEFAULT false,
    "foreignMaterialRemoved" BOOLEAN NOT NULL DEFAULT false,
    "impuritiesSeparated" BOOLEAN NOT NULL DEFAULT false,
    "grainSize" TEXT,
    "color" TEXT,
    "texture" TEXT,
    "moistureLevel" DECIMAL(5,2),
    "purity" DECIMAL(5,2),
    "wastageQuantity" DECIMAL(12,2),
    "qaVerified" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cleaning_grading_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "recipeCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "productionType" "ProductionType" NOT NULL DEFAULT 'SINGLE_GRAIN',
    "mixingRatio" TEXT,
    "processingSequence" TEXT,
    "grindingInstructions" TEXT,
    "roastingInstructions" TEXT,
    "oilExtractionProcess" TEXT,
    "packagingInstructions" TEXT,
    "batchYieldQuantity" DECIMAL(12,2),
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "status" "RecipeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "cropName" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "percentage" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_batches" (
    "id" TEXT NOT NULL,
    "productionBatchNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipeVersion" INTEGER NOT NULL,
    "productionType" "ProductionType" NOT NULL,
    "plannedQuantity" DECIMAL(12,2) NOT NULL,
    "actualQuantity" DECIMAL(12,2),
    "productionLoss" DECIMAL(12,2),
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "productionDate" TIMESTAMP(3) NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PLANNED',
    "machineName" TEXT,
    "machineNumber" TEXT,
    "operatorName" TEXT,
    "productionLine" TEXT,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_consumptions" (
    "id" TEXT NOT NULL,
    "productionBatchId" TEXT NOT NULL,
    "rawMaterialBatchId" TEXT NOT NULL,
    "quantityUsed" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_inspections" (
    "id" TEXT NOT NULL,
    "stage" "InspectionStage" NOT NULL,
    "rawMaterialBatchId" TEXT,
    "productionBatchId" TEXT,
    "finishedGoodsBatchId" TEXT,
    "moisture" DECIMAL(5,2),
    "purity" DECIMAL(5,2),
    "grainSize" TEXT,
    "color" TEXT,
    "foreignMatter" DECIMAL(5,2),
    "odor" TEXT,
    "ingredientRatio" TEXT,
    "mixingAccuracy" TEXT,
    "grindingQuality" TEXT,
    "temperature" DECIMAL(6,2),
    "productConsistency" TEXT,
    "productAppearance" TEXT,
    "productWeight" DECIMAL(12,3),
    "packagingQuality" TEXT,
    "labelAccuracy" TEXT,
    "shelfLifeVerified" BOOLEAN,
    "result" "QualityResult" NOT NULL,
    "remarks" TEXT,
    "inspectedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_goods_batches" (
    "id" TEXT NOT NULL,
    "fgBatchNumber" TEXT NOT NULL,
    "productionBatchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "packagingType" TEXT NOT NULL,
    "netWeight" DECIMAL(12,3) NOT NULL,
    "weightUnit" TEXT NOT NULL DEFAULT 'KG',
    "mrp" DECIMAL(12,2),
    "packagingDate" TIMESTAMP(3) NOT NULL,
    "manufacturingDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "shelfLifeDays" INTEGER,
    "packCount" INTEGER NOT NULL,
    "qrPayload" TEXT,
    "qaReleased" BOOLEAN NOT NULL DEFAULT false,
    "packedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finished_goods_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finished_goods_stock" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "fgBatchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "storageLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finished_goods_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_counters" (
    "key" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequence_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "cleaning_grading_records_rawMaterialBatchId_idx" ON "cleaning_grading_records"("rawMaterialBatchId");

-- CreateIndex
CREATE INDEX "recipes_status_idx" ON "recipes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_recipeCode_version_key" ON "recipes"("recipeCode", "version");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipeId_idx" ON "recipe_ingredients"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "production_batches_productionBatchNumber_key" ON "production_batches"("productionBatchNumber");

-- CreateIndex
CREATE INDEX "production_batches_status_idx" ON "production_batches"("status");

-- CreateIndex
CREATE INDEX "production_batches_branchId_idx" ON "production_batches"("branchId");

-- CreateIndex
CREATE INDEX "production_consumptions_rawMaterialBatchId_idx" ON "production_consumptions"("rawMaterialBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "production_consumptions_productionBatchId_rawMaterialBatchI_key" ON "production_consumptions"("productionBatchId", "rawMaterialBatchId");

-- CreateIndex
CREATE INDEX "quality_inspections_stage_idx" ON "quality_inspections"("stage");

-- CreateIndex
CREATE INDEX "quality_inspections_result_idx" ON "quality_inspections"("result");

-- CreateIndex
CREATE UNIQUE INDEX "finished_goods_batches_fgBatchNumber_key" ON "finished_goods_batches"("fgBatchNumber");

-- CreateIndex
CREATE INDEX "finished_goods_batches_productionBatchId_idx" ON "finished_goods_batches"("productionBatchId");

-- CreateIndex
CREATE INDEX "finished_goods_batches_qaReleased_idx" ON "finished_goods_batches"("qaReleased");

-- CreateIndex
CREATE INDEX "finished_goods_stock_warehouseId_idx" ON "finished_goods_stock"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "finished_goods_stock_warehouseId_fgBatchId_key" ON "finished_goods_stock"("warehouseId", "fgBatchId");

-- AddForeignKey
ALTER TABLE "cleaning_grading_records" ADD CONSTRAINT "cleaning_grading_records_rawMaterialBatchId_fkey" FOREIGN KEY ("rawMaterialBatchId") REFERENCES "raw_material_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_grading_records" ADD CONSTRAINT "cleaning_grading_records_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_rawMaterialBatchId_fkey" FOREIGN KEY ("rawMaterialBatchId") REFERENCES "raw_material_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_rawMaterialBatchId_fkey" FOREIGN KEY ("rawMaterialBatchId") REFERENCES "raw_material_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "production_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_finishedGoodsBatchId_fkey" FOREIGN KEY ("finishedGoodsBatchId") REFERENCES "finished_goods_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_goods_batches" ADD CONSTRAINT "finished_goods_batches_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_goods_batches" ADD CONSTRAINT "finished_goods_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_goods_batches" ADD CONSTRAINT "finished_goods_batches_packedById_fkey" FOREIGN KEY ("packedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_goods_stock" ADD CONSTRAINT "finished_goods_stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_goods_stock" ADD CONSTRAINT "finished_goods_stock_fgBatchId_fkey" FOREIGN KEY ("fgBatchId") REFERENCES "finished_goods_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
