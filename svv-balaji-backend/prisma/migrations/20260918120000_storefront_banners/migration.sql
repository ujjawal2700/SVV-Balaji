-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HOMEPAGE', 'CATEGORIES_PAGE', 'PRODUCTS_PAGE');

-- CreateEnum
CREATE TYPE "BannerAudience" AS ENUM ('ALL', 'B2C', 'B2B');

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "badgeText" TEXT,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "ctaTextPrimary" TEXT NOT NULL,
    "ctaLinkPrimary" TEXT NOT NULL,
    "ctaTextSecondary" TEXT,
    "ctaLinkSecondary" TEXT,
    "backgroundColor" TEXT NOT NULL DEFAULT '#064e3b',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "targetAudience" "BannerAudience" NOT NULL DEFAULT 'ALL',
    "placement" "BannerPlacement" NOT NULL DEFAULT 'HOMEPAGE',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_placement_isActive_displayOrder_idx" ON "banners"("placement", "isActive", "displayOrder");

