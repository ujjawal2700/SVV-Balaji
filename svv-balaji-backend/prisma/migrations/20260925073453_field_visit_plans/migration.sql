-- CreateEnum
CREATE TYPE "FieldVisitPlanStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "field_visit_plans" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "cropName" TEXT,
    "notes" TEXT,
    "status" "FieldVisitPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "completedVisitId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_visit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_visit_plans_completedVisitId_key" ON "field_visit_plans"("completedVisitId");

-- CreateIndex
CREATE INDEX "field_visit_plans_farmerId_idx" ON "field_visit_plans"("farmerId");

-- CreateIndex
CREATE INDEX "field_visit_plans_expertId_status_idx" ON "field_visit_plans"("expertId", "status");

-- CreateIndex
CREATE INDEX "field_visit_plans_plannedDate_idx" ON "field_visit_plans"("plannedDate");

-- AddForeignKey
ALTER TABLE "field_visit_plans" ADD CONSTRAINT "field_visit_plans_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_plans" ADD CONSTRAINT "field_visit_plans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_plans" ADD CONSTRAINT "field_visit_plans_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_plans" ADD CONSTRAINT "field_visit_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_visit_plans" ADD CONSTRAINT "field_visit_plans_completedVisitId_fkey" FOREIGN KEY ("completedVisitId") REFERENCES "field_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
