-- CreateEnum
CREATE TYPE "BatchHoldStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'RECALLED');

-- AlterTable
ALTER TABLE "finished_goods_batches"
  ADD COLUMN "holdStatus" "BatchHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "holdReason" TEXT,
  ADD COLUMN "holdChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "batch_hold_events" (
    "id" TEXT NOT NULL,
    "fgBatchId" TEXT NOT NULL,
    "fromStatus" "BatchHoldStatus" NOT NULL,
    "toStatus" "BatchHoldStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "batch_hold_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finished_goods_batches_holdStatus_idx" ON "finished_goods_batches"("holdStatus");
CREATE INDEX "batch_hold_events_fgBatchId_idx" ON "batch_hold_events"("fgBatchId");

-- AddForeignKey
ALTER TABLE "batch_hold_events" ADD CONSTRAINT "batch_hold_events_fgBatchId_fkey" FOREIGN KEY ("fgBatchId") REFERENCES "finished_goods_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batch_hold_events" ADD CONSTRAINT "batch_hold_events_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
