-- AlterTable
ALTER TABLE "price_lists" ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "badge" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "bulkAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "businessSupportContact" TEXT,
ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "deliveryTerms" TEXT,
ADD COLUMN     "disclaimer" TEXT,
ADD COLUMN     "gstInvoiceAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "maxOrderQuantity" INTEGER,
ADD COLUMN     "maxOrderQuantityB2B" INTEGER,
ADD COLUMN     "minOrderQuantity" INTEGER,
ADD COLUMN     "moqB2B" INTEGER,
ADD COLUMN     "mrp" DECIMAL(12,2),
ADD COLUMN     "packBoxSize" INTEGER,
ADD COLUMN     "packLabel" TEXT,
ADD COLUMN     "rating" DECIMAL(3,2),
ADD COLUMN     "returnPolicy" TEXT,
ADD COLUMN     "reviewCount" INTEGER,
ADD COLUMN     "shelfLife" TEXT,
ADD COLUMN     "warranty" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" TEXT,
    "mrp" DECIMAL(12,2),
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_specifications" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_specifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_faqs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_offers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_productId_displayOrder_idx" ON "product_variants"("productId", "displayOrder");

-- CreateIndex
CREATE INDEX "product_specifications_productId_displayOrder_idx" ON "product_specifications"("productId", "displayOrder");

-- CreateIndex
CREATE INDEX "product_faqs_productId_displayOrder_idx" ON "product_faqs"("productId", "displayOrder");

-- CreateIndex
CREATE INDEX "product_offers_productId_displayOrder_idx" ON "product_offers"("productId", "displayOrder");

-- CreateIndex
CREATE INDEX "price_lists_variantId_idx" ON "price_lists"("variantId");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_specifications" ADD CONSTRAINT "product_specifications_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_faqs" ADD CONSTRAINT "product_faqs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

