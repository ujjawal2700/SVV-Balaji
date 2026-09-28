-- home_sections and legal_policies were created on existing databases with
-- `prisma db push` and never had a migration. Written idempotently so it is a
-- no-op there and creates them on a database built from migrations alone.

DO $$ BEGIN
  CREATE TYPE "PolicyAudience" AS ENUM ('RIDER', 'RETAILER', 'CUSTOMER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PolicyType" AS ENUM ('PRIVACY_POLICY', 'TERMS_AND_CONDITIONS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "home_sections" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "targetAudience" "BannerAudience" NOT NULL DEFAULT 'ALL',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "legal_policies" (
    "id" TEXT NOT NULL,
    "audience" "PolicyAudience" NOT NULL,
    "type" "PolicyType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "legal_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "home_sections_isActive_displayOrder_idx" ON "home_sections"("isActive", "displayOrder");
CREATE UNIQUE INDEX IF NOT EXISTS "legal_policies_audience_type_key" ON "legal_policies"("audience", "type");
