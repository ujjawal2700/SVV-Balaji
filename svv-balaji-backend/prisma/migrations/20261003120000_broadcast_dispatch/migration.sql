-- Broadcast dispatch: offer a task to several ranked riders at once, first accept wins.

-- AlterEnum
ALTER TYPE "DeliveryOfferStatus" ADD VALUE 'TAKEN';

-- AlterTable
ALTER TABLE "products" ADD COLUMN "packWeightKg" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "riders" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "delivery_tasks" ADD COLUMN "autoDispatchPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "weightKg" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "delivery_settings" ADD COLUMN "broadcastSize" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "maxPickupDistanceKm" DECIMAL(6,2),
ADD COLUMN "riderHeartbeatMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "vehicleMaxKg" JSONB NOT NULL DEFAULT '{}';
