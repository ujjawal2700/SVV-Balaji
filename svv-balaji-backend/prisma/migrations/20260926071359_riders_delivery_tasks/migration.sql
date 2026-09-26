-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiderAvailability" AS ENUM ('OFFLINE', 'ONLINE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BICYCLE', 'MOTORCYCLE', 'SCOOTER', 'EV_SCOOTER', 'OTHER');

-- CreateEnum
CREATE TYPE "RiderOtpPurpose" AS ENUM ('VERIFY_PHONE', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "DeliveryTaskKind" AS ENUM ('ORDER_DELIVERY', 'RETURN_PICKUP');

-- CreateEnum
CREATE TYPE "DeliveryTaskStatus" AS ENUM ('READY_FOR_PICKUP', 'OFFERED', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP', 'DELIVERED', 'FAILED', 'RETURNED_TO_STORE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CodMethod" AS ENUM ('CASH', 'UPI');

-- CreateEnum
CREATE TYPE "RiderCashEntryType" AS ENUM ('COD_COLLECTED', 'DEPOSITED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED', 'ADDRESS_ISSUE', 'RIDER_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "FailureFollowUp" AS ENUM ('RETURN_TO_STORE', 'AUTO_REATTEMPT');

-- CreateEnum
CREATE TYPE "EarningRuleKind" AS ENUM ('BASE_PER_DELIVERY', 'DISTANCE_SLAB', 'PEAK_HOUR', 'ZONE_INCENTIVE', 'DAILY_TARGET', 'WEEKLY_TARGET', 'WAITING_TIME', 'OUTCOME_COMPENSATION');

-- CreateEnum
CREATE TYPE "RiderEarningType" AS ENUM ('BASE', 'DISTANCE', 'PEAK', 'ZONE_INCENTIVE', 'DAILY_BONUS', 'WEEKLY_BONUS', 'WAITING', 'OUTCOME', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "riders" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "RiderStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "phoneVerifiedAt" TIMESTAMP(3),
    "city" TEXT,
    "vehicleType" "VehicleType",
    "vehicleNumber" TEXT,
    "licenceNumber" TEXT,
    "photoUrl" TEXT,
    "documentUrl" TEXT,
    "warehouseId" TEXT,
    "maxActiveTasks" INTEGER NOT NULL DEFAULT 1,
    "availability" "RiderAvailability" NOT NULL DEFAULT 'OFFLINE',
    "availabilityChangedAt" TIMESTAMP(3),
    "lastLatitude" DECIMAL(9,6),
    "lastLongitude" DECIMAL(9,6),
    "lastLocationAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_sessions" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "RiderOtpPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "riderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_tasks" (
    "id" TEXT NOT NULL,
    "taskNumber" TEXT NOT NULL,
    "kind" "DeliveryTaskKind" NOT NULL DEFAULT 'ORDER_DELIVERY',
    "status" "DeliveryTaskStatus" NOT NULL DEFAULT 'READY_FOR_PICKUP',
    "speed" "DeliverySpeed" NOT NULL DEFAULT 'STANDARD',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "orderId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "zoneId" TEXT,
    "dropName" TEXT NOT NULL,
    "dropPhone" TEXT NOT NULL,
    "dropAddress" TEXT NOT NULL,
    "dropLatitude" DECIMAL(9,6),
    "dropLongitude" DECIMAL(9,6),
    "distanceKm" DECIMAL(8,2),
    "codAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "promisedBy" TIMESTAMP(3),
    "riderId" TEXT,
    "needsManualAssignment" BOOLEAN NOT NULL DEFAULT false,
    "offerRound" INTEGER NOT NULL DEFAULT 0,
    "readyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "arrivedPickupAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "outForDeliveryAt" TIMESTAMP(3),
    "arrivedDropAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "arrivedPickupVerified" BOOLEAN NOT NULL DEFAULT false,
    "arrivedDropVerified" BOOLEAN NOT NULL DEFAULT false,
    "failureReasonCode" TEXT,
    "failureNote" TEXT,
    "failureProofUrl" TEXT,
    "cancelStage" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_task_events" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "riderId" TEXT,
    "actorUserId" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_task_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_offers" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "status" "DeliveryOfferStatus" NOT NULL DEFAULT 'PENDING',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "rejectReason" TEXT,

    CONSTRAINT "delivery_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_collections" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "expectedAmount" DECIMAL(14,2) NOT NULL,
    "collectedAmount" DECIMAL(14,2) NOT NULL,
    "method" "CodMethod" NOT NULL,
    "reference" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cod_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_cash_entries" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" "RiderCashEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "taskId" TEXT,
    "codCollectionId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_cash_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_failure_reasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "FailureCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresNote" BOOLEAN NOT NULL DEFAULT false,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "requiresArrival" BOOLEAN NOT NULL DEFAULT false,
    "followUp" "FailureFollowUp" NOT NULL DEFAULT 'RETURN_TO_STORE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_failure_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_settings" (
    "id" TEXT NOT NULL,
    "autoOffer" BOOLEAN NOT NULL DEFAULT true,
    "offerTimeoutSeconds" INTEGER NOT NULL DEFAULT 45,
    "maxOfferRounds" INTEGER NOT NULL DEFAULT 5,
    "locationFreshMinutes" INTEGER NOT NULL DEFAULT 10,
    "geofenceMeters" INTEGER NOT NULL DEFAULT 250,
    "requireCodBeforeDelivery" BOOLEAN NOT NULL DEFAULT true,
    "maxCashInHand" DECIMAL(12,2),
    "reattemptDelayMinutes" INTEGER NOT NULL DEFAULT 15,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_earning_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EarningRuleKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "zoneId" TEXT,
    "config" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_earning_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_earnings" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" "RiderEarningType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "taskId" TEXT,
    "ruleId" TEXT,
    "dedupeKey" TEXT,
    "detail" JSONB,
    "note" TEXT,
    "recordedById" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_notifications" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "taskId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "riders_code_key" ON "riders"("code");

-- CreateIndex
CREATE UNIQUE INDEX "riders_phone_key" ON "riders"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "riders_email_key" ON "riders"("email");

-- CreateIndex
CREATE INDEX "riders_warehouseId_status_availability_idx" ON "riders"("warehouseId", "status", "availability");

-- CreateIndex
CREATE INDEX "rider_sessions_riderId_idx" ON "rider_sessions"("riderId");

-- CreateIndex
CREATE INDEX "rider_otps_phone_createdAt_idx" ON "rider_otps"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_tasks_taskNumber_key" ON "delivery_tasks"("taskNumber");

-- CreateIndex
CREATE INDEX "delivery_tasks_riderId_status_idx" ON "delivery_tasks"("riderId", "status");

-- CreateIndex
CREATE INDEX "delivery_tasks_warehouseId_status_idx" ON "delivery_tasks"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "delivery_tasks_orderId_idx" ON "delivery_tasks"("orderId");

-- CreateIndex
CREATE INDEX "delivery_task_events_taskId_createdAt_idx" ON "delivery_task_events"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "delivery_offers_riderId_status_idx" ON "delivery_offers"("riderId", "status");

-- CreateIndex
CREATE INDEX "delivery_offers_taskId_idx" ON "delivery_offers"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "cod_collections_taskId_key" ON "cod_collections"("taskId");

-- CreateIndex
CREATE INDEX "cod_collections_orderId_idx" ON "cod_collections"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "rider_cash_entries_codCollectionId_key" ON "rider_cash_entries"("codCollectionId");

-- CreateIndex
CREATE INDEX "rider_cash_entries_riderId_createdAt_idx" ON "rider_cash_entries"("riderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_failure_reasons_code_key" ON "delivery_failure_reasons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rider_earnings_dedupeKey_key" ON "rider_earnings"("dedupeKey");

-- CreateIndex
CREATE INDEX "rider_earnings_riderId_earnedAt_idx" ON "rider_earnings"("riderId", "earnedAt");

-- CreateIndex
CREATE INDEX "rider_notifications_riderId_createdAt_idx" ON "rider_notifications"("riderId", "createdAt");

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_sessions" ADD CONSTRAINT "rider_sessions_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_otps" ADD CONSTRAINT "rider_otps_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_task_events" ADD CONSTRAINT "delivery_task_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "delivery_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "delivery_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_offers" ADD CONSTRAINT "delivery_offers_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_collections_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "delivery_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_collections_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_cash_entries" ADD CONSTRAINT "rider_cash_entries_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_cash_entries" ADD CONSTRAINT "rider_cash_entries_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earning_rules" ADD CONSTRAINT "rider_earning_rules_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "delivery_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "rider_earning_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_notifications" ADD CONSTRAINT "rider_notifications_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
