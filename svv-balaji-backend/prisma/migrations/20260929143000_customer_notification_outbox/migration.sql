-- Make the order-notification bridge restart-safe. Existing timeline rows are
-- historical and must not generate a burst of old customer notifications when
-- this migration is deployed.
ALTER TABLE "order_events"
ADD COLUMN "customerNotificationHandledAt" TIMESTAMP(3);

UPDATE "order_events"
SET "customerNotificationHandledAt" = CURRENT_TIMESTAMP;

CREATE INDEX "order_events_customerNotificationHandledAt_createdAt_idx"
ON "order_events"("customerNotificationHandledAt", "createdAt");
