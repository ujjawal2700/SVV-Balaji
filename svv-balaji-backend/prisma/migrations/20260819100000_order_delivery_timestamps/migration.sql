-- Delivery timing on orders (FRD Section 34, Delivery Reports).
--
-- Status tells you an order was dispatched. It cannot tell you when, so
-- "Delayed Shipments" and "Delivery Performance" have no input without these
-- two columns. Added ahead of the reporting module deliberately: a timestamp
-- is the one kind of data that cannot be reconstructed later, so every order
-- dispatched before this migration is permanently unmeasurable.
--
-- Both nullable with no default. A default of now() would stamp every existing
-- order with the migration date and quietly invent a fleet of on-time
-- deliveries; null correctly reads as "not captured".

ALTER TABLE "orders" ADD COLUMN "dispatchedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "deliveredAt"  TIMESTAMP(3);

-- Delivery reporting is a date-range scan over dispatches.
CREATE INDEX "orders_dispatchedAt_idx" ON "orders"("dispatchedAt");

-- Delivered before it was dispatched is not a late delivery, it is a bug.
-- Cheaper to refuse here than to explain a negative transit time in a report.
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_after_dispatched"
  CHECK ("deliveredAt" IS NULL OR "dispatchedAt" IS NULL OR "deliveredAt" >= "dispatchedAt");
