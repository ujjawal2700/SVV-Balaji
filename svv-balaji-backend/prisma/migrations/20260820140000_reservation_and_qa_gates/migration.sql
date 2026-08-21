-- FRD 17.2 raw-material reservation, and FRD 18.3 cleaning QA sign-off.
--
-- Both columns exist to make an existing field mean something. `reservedQuantity`
-- on warehouse_stock has been read in three places and written by nothing since
-- it was added; `qaVerified` on a cleaning record has been settable by the
-- operator who wrote the record and read by no one.
--
-- NOTE ON THE FIRST ATTEMPT AT THIS FILE: it added the verifier columns and the
-- constraint requiring them in one step, with no backfill. Every cleaning record
-- the old self-certifying form had already marked verified violated it the
-- moment it landed, and the migration failed. Existing data now gets fixed
-- before anything is enforced against it - which is the general rule this file
-- previously broke.

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

-- Backfill BEFORE constraining.
--
-- Any row already flagged verified was flagged by the operator on their own
-- record, through a form field that no code ever read - that is the whole
-- defect FRD 18.3 is being fixed for. There is no verifier to name and no
-- honest way to invent one, so those flags are cleared rather than grandfathered.
--
-- The operational consequence is deliberate and worth stating: those batches now
-- need a real QA sign-off before production will accept them. That is the point.
-- Grandfathering them would carry the unverified material forward wearing a
-- verification badge, which is worse than asking QA to look at it.
UPDATE "cleaning_grading_records"
   SET "qaVerified" = false
 WHERE "qaVerified" = true
   AND "qaVerifiedById" IS NULL;

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
-- release ran twice or a reserve ran without a matching decrement.
-- --------------------------------------------------------------------------

-- Raw material: nothing has ever written this column, so any non-zero value is
-- residue rather than a real holding. Safe to zero.
UPDATE "warehouse_stock" SET "reservedQuantity" = 0
 WHERE "reservedQuantity" < 0 OR "reservedQuantity" > "quantity";

ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_reservation_sane" CHECK (
  "reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity"
);

-- Finished goods: this column IS written, by sales allocation, so a bad value
-- here is a real event and not residue. Only the impossible case is corrected.
UPDATE "finished_goods_stock" SET "reservedQuantity" = 0 WHERE "reservedQuantity" < 0;

-- Added NOT VALID on purpose. It enforces the rule on every insert and update
-- from now on, but does not fail the migration on a pre-existing
-- over-reservation - that would be an outage caused by a diagnostic. Any such
-- row stays visible for investigation instead of being silently rewritten:
--
--   SELECT * FROM finished_goods_stock WHERE "reservedQuantity" > quantity;
--
-- Once that returns nothing:
--
--   ALTER TABLE "finished_goods_stock" VALIDATE CONSTRAINT "fg_stock_reservation_sane";
ALTER TABLE "finished_goods_stock" ADD CONSTRAINT "fg_stock_reservation_sane" CHECK (
  "reservedQuantity" >= 0 AND "reservedQuantity" <= "quantity"
) NOT VALID;
