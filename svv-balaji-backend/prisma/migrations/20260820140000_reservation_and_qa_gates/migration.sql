-- FRD 17.2 raw-material reservation, and FRD 18.3 cleaning QA sign-off.
--
-- Both columns exist to make an existing field mean something. `reservedQuantity`
-- on warehouse_stock has been read in three places and written by nothing since
-- it was added; `qaVerified` on a cleaning record has been settable by the
-- operator who wrote the record and read by no one. Neither needs a new table,
-- only the missing context.

-- --------------------------------------------------------------------------
-- A planned run reserves stock in a specific warehouse. The release has to find
-- exactly those rows again when the run starts or is cancelled, so the
-- warehouse stops being a create-time argument and becomes a property of the
-- run. Nullable because runs that predate reservation have nothing to backfill.
-- --------------------------------------------------------------------------
ALTER TABLE "production_batches" ADD COLUMN "warehouseId" TEXT;

ALTER TABLE "production_batches"
  ADD CONSTRAINT "production_batches_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "production_batches_warehouseId_idx" ON "production_batches"("warehouseId");

-- --------------------------------------------------------------------------
-- FRD 18.3: QA approves cleaned material before it is manufactured. A sign-off
-- nobody is named against is not a sign-off, so who and when are recorded
-- alongside the flag.
-- --------------------------------------------------------------------------
ALTER TABLE "cleaning_grading_records" ADD COLUMN "qaVerifiedById" TEXT;
ALTER TABLE "cleaning_grading_records" ADD COLUMN "qaVerifiedAt"   TIMESTAMP(3);

ALTER TABLE "cleaning_grading_records"
  ADD CONSTRAINT "cleaning_grading_records_qaVerifiedById_fkey"
  FOREIGN KEY ("qaVerifiedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Verified means verified BY someone, AT a time. All three move together or
-- none do - a true flag with no verifier is exactly the state this fixes.
ALTER TABLE "cleaning_grading_records" ADD CONSTRAINT "cleaning_records_verification_complete" CHECK (
  ("qaVerified" = false AND "qaVerifiedById" IS NULL AND "qaVerifiedAt" IS NULL)
  OR
  ("qaVerified" = true  AND "qaVerifiedById" IS NOT NULL AND "qaVerifiedAt" IS NOT NULL)
);

-- --------------------------------------------------------------------------
-- Reservation invariants on the stock rows themselves.
--
-- These are the guard rails that make a reservation bug loud instead of silent.
-- A negative reservation, or one exceeding the quantity on hand, means a
-- release ran twice or a reserve ran without a matching decrement - both of
-- which otherwise show up months later as stock that looks used and is not.
-- --------------------------------------------------------------------------
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_reservation_sane" CHECK (
  "reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity"
);

ALTER TABLE "finished_goods_stock" ADD CONSTRAINT "fg_stock_reservation_sane" CHECK (
  "reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity"
);
