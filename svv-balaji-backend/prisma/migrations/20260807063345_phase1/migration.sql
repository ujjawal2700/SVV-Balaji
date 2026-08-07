-- CreateEnum
CREATE TYPE "FarmerVerificationAction" AS ENUM ('APPROVED', 'REJECTED', 'DOCUMENTS_REQUESTED');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "farmers" ADD COLUMN     "cropDetails" TEXT,
ALTER COLUMN "farmerCode" DROP NOT NULL;

-- CreateTable
CREATE TABLE "farmer_code_counters" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "farmer_code_counters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "farmer_verification_logs" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "action" "FarmerVerificationAction" NOT NULL,
    "remarks" TEXT,
    "verifiedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "cropName" TEXT NOT NULL,
    "variety" TEXT,
    "expectedQuantity" DECIMAL(12,2) NOT NULL,
    "purchaseRate" DECIMAL(12,2) NOT NULL,
    "agreementDate" TIMESTAMP(3) NOT NULL,
    "harvestDate" TIMESTAMP(3),
    "qualityStandards" TEXT,
    "status" "AgreementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seed_distributions" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "seedName" TEXT NOT NULL,
    "seedVariety" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'KG',
    "batchNumber" TEXT,
    "distributionDate" TIMESTAMP(3) NOT NULL,
    "distributedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seed_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT NOT NULL,
    "conductedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_attendances" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_materials" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_visits" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "cropName" TEXT,
    "cropGrowthStage" TEXT,
    "cropHealth" TEXT,
    "pestStatus" TEXT,
    "diseaseObservation" TEXT,
    "fertilizerAdvice" TEXT,
    "irrigationAdvice" TEXT,
    "pestControlSuggestions" TEXT,
    "harvestPreparation" TEXT,
    "yieldPredictionQty" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_visit_documents" (
    "id" TEXT NOT NULL,
    "fieldVisitId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_visit_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "farmer_verification_logs_farmerId_idx" ON "farmer_verification_logs"("farmerId");

-- CreateIndex
CREATE INDEX "agreements_farmerId_idx" ON "agreements"("farmerId");

-- CreateIndex
CREATE INDEX "agreements_status_idx" ON "agreements"("status");

-- CreateIndex
CREATE INDEX "seed_distributions_farmerId_idx" ON "seed_distributions"("farmerId");

-- CreateIndex
CREATE INDEX "training_sessions_branchId_idx" ON "training_sessions"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "training_attendances_sessionId_farmerId_key" ON "training_attendances"("sessionId", "farmerId");

-- CreateIndex
CREATE INDEX "field_visits_farmerId_idx" ON "field_visits"("farmerId");

-- CreateIndex
CREATE INDEX "field_visits_expertId_idx" ON "field_visits"("expertId");

-- AddForeignKey
ALTER TABLE "farmer_verification_logs" ADD CONSTRAINT "farmer_verification_logs_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_verification_logs" ADD CONSTRAINT "farmer_verification_logs_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seed_distributions" ADD CONSTRAINT "seed_distributions_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seed_distributions" ADD CONSTRAINT "seed_distributions_distributedById_fkey" FOREIGN KEY ("distributedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_conductedById_fkey" FOREIGN KEY ("conductedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendances" ADD CONSTRAINT "training_attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_attendances" ADD CONSTRAINT "training_attendances_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_materials" ADD CONSTRAINT "training_materials_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visits" ADD CONSTRAINT "field_visits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_documents" ADD CONSTRAINT "field_visit_documents_fieldVisitId_fkey" FOREIGN KEY ("fieldVisitId") REFERENCES "field_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
