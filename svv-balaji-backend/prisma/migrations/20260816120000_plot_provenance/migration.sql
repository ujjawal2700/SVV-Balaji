-- Plot provenance: which field a harvest actually came from.
--
-- Both columns are nullable and must stay that way. Every inspection and
-- collection recorded before plots existed has no plot, and a farmer whose land
-- has not been mapped yet still has to be inspectable - a missing plot is a gap
-- in the trace, not a reason to block procurement.
--
-- ON DELETE SET NULL rather than RESTRICT: a plot is descriptive, and deleting
-- one should not be blocked by a harvest, nor should it erase the harvest. The
-- trace degrades to "we no longer know which field" rather than failing.

-- AlterTable
ALTER TABLE "harvest_inspections" ADD COLUMN "plotId" TEXT;

-- AlterTable
ALTER TABLE "raw_material_collections" ADD COLUMN "plotId" TEXT;

-- CreateIndex
CREATE INDEX "harvest_inspections_plotId_idx" ON "harvest_inspections"("plotId");

-- CreateIndex
CREATE INDEX "raw_material_collections_plotId_idx" ON "raw_material_collections"("plotId");

-- AddForeignKey
ALTER TABLE "harvest_inspections" ADD CONSTRAINT "harvest_inspections_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "farm_plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_collections" ADD CONSTRAINT "raw_material_collections_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "farm_plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
