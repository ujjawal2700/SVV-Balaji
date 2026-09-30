-- Link automatic customer notifications to the exact order timeline event
-- that produced them. The unique index makes event replay idempotent.
ALTER TABLE "app_notifications" ADD COLUMN "orderEventId" TEXT;

CREATE UNIQUE INDEX "app_notifications_orderEventId_key"
ON "app_notifications"("orderEventId");

ALTER TABLE "app_notifications"
ADD CONSTRAINT "app_notifications_orderEventId_fkey"
FOREIGN KEY ("orderEventId") REFERENCES "order_events"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
