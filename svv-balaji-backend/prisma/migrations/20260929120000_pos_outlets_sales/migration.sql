-- CreateEnum
CREATE TYPE "PosShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PosPaymentMode" AS ENUM ('CASH', 'UPI', 'CARD');

-- CreateEnum
CREATE TYPE "PosSaleStatus" AS ENUM ('COMPLETED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PosCustomerType" AS ENUM ('WALK_IN', 'REGULAR_KIRANA', 'INSTITUTIONAL');

-- AlterEnum
ALTER TYPE "WarehouseKind" ADD VALUE 'STORE';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "posSaleId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL,
ALTER COLUMN "customerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "pos_outlets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "state" TEXT NOT NULL,
    "pincode" TEXT,
    "managerName" TEXT,
    "managerPhone" TEXT,
    "defaultCashierName" TEXT,
    "posTerminalsCount" INTEGER NOT NULL DEFAULT 1,
    "defaultOpeningCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_shifts" (
    "id" TEXT NOT NULL,
    "shiftNumber" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "status" "PosShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingCash" DECIMAL(12,2) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "expectedCash" DECIMAL(12,2),
    "countedCash" DECIMAL(12,2),
    "discrepancy" DECIMAL(12,2),
    "notes" TEXT,

    CONSTRAINT "pos_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sales" (
    "id" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "outletId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "customerType" "PosCustomerType" NOT NULL DEFAULT 'WALK_IN',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerGstin" TEXT,
    "customerAddress" TEXT,
    "customerCity" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "paymentMode" "PosPaymentMode" NOT NULL,
    "amountTendered" DECIMAL(14,2),
    "changeDue" DECIMAL(14,2),
    "paymentReference" TEXT,
    "status" "PosSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "refundedAt" TIMESTAMP(3),
    "refundedById" TEXT,
    "refundReason" TEXT,
    "refundShiftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sale_lines" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "priceListId" TEXT,
    "gstRatePercent" DECIMAL(5,2) NOT NULL,
    "lineSubtotal" DECIMAL(14,2) NOT NULL,
    "lineDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTax" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "pos_sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sale_allocations" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "fgBatchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "pos_sale_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_outlets_code_key" ON "pos_outlets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "pos_outlets_warehouseId_key" ON "pos_outlets"("warehouseId");

-- CreateIndex
CREATE INDEX "pos_outlets_branchId_idx" ON "pos_outlets"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_shifts_shiftNumber_key" ON "pos_shifts"("shiftNumber");

-- CreateIndex
CREATE INDEX "pos_shifts_outletId_status_idx" ON "pos_shifts"("outletId", "status");

-- CreateIndex
CREATE INDEX "pos_shifts_cashierId_status_idx" ON "pos_shifts"("cashierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_saleNumber_key" ON "pos_sales"("saleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_clientRequestId_key" ON "pos_sales"("clientRequestId");

-- CreateIndex
CREATE INDEX "pos_sales_outletId_createdAt_idx" ON "pos_sales"("outletId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_sales_shiftId_idx" ON "pos_sales"("shiftId");

-- CreateIndex
CREATE INDEX "pos_sales_status_idx" ON "pos_sales"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sale_lines_saleId_lineNo_key" ON "pos_sale_lines"("saleId", "lineNo");

-- CreateIndex
CREATE INDEX "pos_sale_allocations_fgBatchId_idx" ON "pos_sale_allocations"("fgBatchId");

-- CreateIndex
CREATE INDEX "invoices_posSaleId_idx" ON "invoices"("posSaleId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "pos_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_outlets" ADD CONSTRAINT "pos_outlets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_outlets" ADD CONSTRAINT "pos_outlets_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "pos_outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "pos_outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "pos_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_refundShiftId_fkey" FOREIGN KEY ("refundShiftId") REFERENCES "pos_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_allocations" ADD CONSTRAINT "pos_sale_allocations_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "pos_sale_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_allocations" ADD CONSTRAINT "pos_sale_allocations_fgBatchId_fkey" FOREIGN KEY ("fgBatchId") REFERENCES "finished_goods_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- An invoice bills exactly one thing: an order or a counter sale.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_one_source_chk"
  CHECK (("orderId" IS NOT NULL) <> ("posSaleId" IS NOT NULL));
