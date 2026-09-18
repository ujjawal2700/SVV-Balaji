-- CreateTable
CREATE TABLE "schemes" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL,
    "ctaLink" TEXT NOT NULL DEFAULT '/products/atta-flour',
    "backgroundColor" TEXT NOT NULL DEFAULT '#fce3cd',
    "textColor" TEXT NOT NULL DEFAULT '#452b0d',
    "badgeColor" TEXT NOT NULL DEFAULT '#965a0b',
    "badgeTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "buttonColor" TEXT NOT NULL DEFAULT '#8a4b08',
    "buttonTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "targetAudience" "BannerAudience" NOT NULL DEFAULT 'ALL',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schemes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schemes_isActive_displayOrder_idx" ON "schemes"("isActive", "displayOrder");

