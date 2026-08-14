-- Land profiling: multiple plots per farmer.
--
-- The summary fields on `farmers` (farmSizeAcres, landType, irrigationType,
-- cropDetails) are deliberately untouched. They are what the onboarding desk
-- captures and what six existing screens read; plots are the detail the field
-- executive adds afterwards.
--
-- ON DELETE CASCADE from farmer is safe because a farmer holding a traceability
-- code can never be deleted - the only farmers that can disappear are ones
-- nothing downstream references.

-- CreateTable
CREATE TABLE "farm_plots" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "surveyNumber" TEXT,
    "areaAcres" DECIMAL(10,2) NOT NULL,
    "soilType" TEXT,
    "irrigationType" TEXT,
    "waterSource" TEXT,
    "currentCrop" TEXT,
    "sowingDate" TIMESTAMP(3),
    "expectedHarvest" TIMESTAMP(3),
    "gpsLocation" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_plots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "farm_plots_farmerId_idx" ON "farm_plots"("farmerId");

-- AddForeignKey
ALTER TABLE "farm_plots" ADD CONSTRAINT "farm_plots_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_plots" ADD CONSTRAINT "farm_plots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
