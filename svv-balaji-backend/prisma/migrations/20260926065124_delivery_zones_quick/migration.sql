-- CreateEnum
CREATE TYPE "DeliverySpeed" AS ENUM ('STANDARD', 'QUICK');

-- CreateEnum
CREATE TYPE "ZoneProductScope" AS ENUM ('ALL_PRODUCTS', 'SELECTED_CATEGORIES');

-- CreateEnum
CREATE TYPE "ZoneFallback" AS ENUM ('STANDARD', 'COURIER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliverySpeed" "DeliverySpeed" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "deliveryZoneId" TEXT;

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "quickEnabled" BOOLEAN NOT NULL DEFAULT false,
    "warehouseId" TEXT NOT NULL,
    "boundary" JSONB,
    "pincodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxRadiusKm" DECIMAL(6,2),
    "targetMinMinutes" INTEGER NOT NULL,
    "targetMaxMinutes" INTEGER NOT NULL,
    "operatingHours" JSONB NOT NULL DEFAULT '[]',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "productScope" "ZoneProductScope" NOT NULL DEFAULT 'ALL_PRODUCTS',
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fallback" "ZoneFallback" NOT NULL DEFAULT 'STANDARD',
    "quickFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quickFreeAbove" DECIMAL(12,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_code_key" ON "delivery_zones"("code");

-- CreateIndex
CREATE INDEX "delivery_zones_warehouseId_idx" ON "delivery_zones"("warehouseId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
