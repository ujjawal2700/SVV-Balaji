-- CreateEnum
CREATE TYPE "PushApp" AS ENUM ('ADMIN', 'FIELD', 'CUSTOMER', 'RIDER');

-- CreateEnum
CREATE TYPE "PushRecipientKind" AS ENUM ('STAFF', 'CUSTOMER', 'RIDER');

-- AlterTable
ALTER TABLE "rider_notifications" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "link" TEXT;

-- CreateTable
CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "app" "PushApp" NOT NULL,
    "kind" "PushRecipientKind" NOT NULL,
    "userId" TEXT,
    "customerAccountId" TEXT,
    "riderId" TEXT,
    "sessionId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_broadcasts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "link" TEXT,
    "audience" JSONB NOT NULL,
    "audienceSummary" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "reachableCount" INTEGER NOT NULL DEFAULT 0,
    "deviceCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_notifications" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT,
    "kind" "PushRecipientKind" NOT NULL,
    "userId" TEXT,
    "customerAccountId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");

-- CreateIndex
CREATE INDEX "push_devices_userId_idx" ON "push_devices"("userId");

-- CreateIndex
CREATE INDEX "push_devices_customerAccountId_idx" ON "push_devices"("customerAccountId");

-- CreateIndex
CREATE INDEX "push_devices_riderId_idx" ON "push_devices"("riderId");

-- CreateIndex
CREATE INDEX "push_broadcasts_createdAt_idx" ON "push_broadcasts"("createdAt");

-- CreateIndex
CREATE INDEX "app_notifications_userId_createdAt_idx" ON "app_notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "app_notifications_customerAccountId_createdAt_idx" ON "app_notifications"("customerAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_broadcasts" ADD CONSTRAINT "push_broadcasts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "push_broadcasts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "customer_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

