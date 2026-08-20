-- A-13: order model decisions, 16 August 2026.
-- See SVV_Balaji_A13_Order_Model_Decision.md for the reasoning.
--
-- Both changes are additive and nullable. An existing database comes up
-- behaving exactly as it does now; nothing has to be backfilled.

-- ---------------------------------------------------------------------------
-- 2. One movement ledger for both kinds of stock.
--
-- Raw material has always held the invariant that quantity is never mutated
-- except alongside a row here. Finished goods did not. Widening this table
-- rather than adding a second one means one place to read for "everything that
-- happened to stock".
-- ---------------------------------------------------------------------------

-- batchId becomes optional: a finished-goods movement has no raw material batch.
ALTER TABLE "stock_movements" ALTER COLUMN "batchId" DROP NOT NULL;

ALTER TABLE "stock_movements" ADD COLUMN "fgBatchId" TEXT;

-- CreateIndex
CREATE INDEX "stock_movements_fgBatchId_idx" ON "stock_movements"("fgBatchId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fgBatchId_fkey" FOREIGN KEY ("fgBatchId") REFERENCES "finished_goods_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exactly one of the two must be set. Prisma cannot express this, and without
-- it a movement can be written that belongs to nothing - which is worse than no
-- ledger at all, because it looks like a record.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_one_batch_kind"
  CHECK (("batchId" IS NOT NULL AND "fgBatchId" IS NULL)
      OR ("batchId" IS NULL AND "fgBatchId" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 3. Allocations are released, never deleted.
--
-- cancel() used to delete these rows after returning the reservations. The
-- stock was right; the record of which batches were promised to the customer
-- was gone.
-- ---------------------------------------------------------------------------

ALTER TABLE "order_allocations" ADD COLUMN "releasedAt" TIMESTAMP(3);
ALTER TABLE "order_allocations" ADD COLUMN "releasedReason" TEXT;

-- Live allocations are the common read; a partial index keeps it cheap as
-- released rows accumulate.
CREATE INDEX "order_allocations_live_idx" ON "order_allocations"("orderId") WHERE "releasedAt" IS NULL;
