-- FRD 7.1 Family Details, and FRD 7.6 Farmer Performance.
--
-- The scores are stored on the farmer rather than computed on read because
-- FRD 7.4 lists Quality Rating as a search filter, and a value computed in
-- application code cannot be filtered or sorted in SQL without loading every
-- farmer. FarmerPerformanceService owns keeping them current.
--
-- Every score is nullable with NO default. Zero would be wrong and actively
-- harmful here: it reads as "this farmer scores nothing" when the truth is
-- "this farmer has no procurement history yet". A new farmer must be unrated,
-- not bottom-rated, or the first sort by rating buries every new registration.

ALTER TABLE "farmers" ADD COLUMN "familyDetails" TEXT;

ALTER TABLE "farmers" ADD COLUMN "qualityRating"            DECIMAL(5,2);
ALTER TABLE "farmers" ADD COLUMN "cropQualityScore"         DECIMAL(5,2);
ALTER TABLE "farmers" ADD COLUMN "deliveryTimelinessScore"  DECIMAL(5,2);
ALTER TABLE "farmers" ADD COLUMN "procurementQuantityScore" DECIMAL(5,2);
ALTER TABLE "farmers" ADD COLUMN "performanceUpdatedAt"     TIMESTAMP(3);

-- FRD 7.4 sorts and filters on the rating.
CREATE INDEX "farmers_qualityRating_idx" ON "farmers"("qualityRating");

-- A score outside 0-100 is a calculator bug, and one that would be invisible
-- in a star rating. Refuse it at the boundary rather than rendering 7 stars.
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_scores_in_range" CHECK (
  ("qualityRating"            IS NULL OR ("qualityRating"            BETWEEN 0 AND 100)) AND
  ("cropQualityScore"         IS NULL OR ("cropQualityScore"         BETWEEN 0 AND 100)) AND
  ("deliveryTimelinessScore"  IS NULL OR ("deliveryTimelinessScore"  BETWEEN 0 AND 100)) AND
  ("procurementQuantityScore" IS NULL OR ("procurementQuantityScore" BETWEEN 0 AND 100))
);
