-- Rider onboarding: documents (incl. Police Clearance Certificate), security
-- deposit ledger, and the verification gate on riders. See DEV_LOG 2026-10-05.

-- CreateEnum
CREATE TYPE "RiderDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiderDepositEntryType" AS ENUM ('PAYMENT', 'REFUND', 'FORFEIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RiderDepositMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'ONLINE', 'EARNINGS_DEDUCTION', 'OTHER');

-- AlterTable
ALTER TABLE "riders" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationCheckedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "delivery_settings" ADD COLUMN     "securityDepositAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "securityDepositRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "rider_document_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresNumber" BOOLEAN NOT NULL DEFAULT false,
    "requiresIssuer" BOOLEAN NOT NULL DEFAULT false,
    "requiresIssueDate" BOOLEAN NOT NULL DEFAULT false,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_documents" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "fileUrls" TEXT[],
    "documentNumber" TEXT,
    "issuedBy" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE,
    "status" "RiderDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_deposit_entries" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" "RiderDepositEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "RiderDepositMethod",
    "reference" TEXT,
    "note" TEXT,
    "gatewayPaymentId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_deposit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_deposit_orders" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "gatewayOrderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_deposit_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rider_document_types_code_key" ON "rider_document_types"("code");

-- CreateIndex
CREATE INDEX "rider_documents_riderId_typeId_createdAt_idx" ON "rider_documents"("riderId", "typeId", "createdAt");

-- CreateIndex
CREATE INDEX "rider_documents_status_supersededAt_idx" ON "rider_documents"("status", "supersededAt");

-- CreateIndex
CREATE UNIQUE INDEX "rider_deposit_entries_gatewayPaymentId_key" ON "rider_deposit_entries"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "rider_deposit_entries_riderId_createdAt_idx" ON "rider_deposit_entries"("riderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rider_deposit_orders_gatewayOrderId_key" ON "rider_deposit_orders"("gatewayOrderId");

-- CreateIndex
CREATE INDEX "rider_deposit_orders_riderId_idx" ON "rider_deposit_orders"("riderId");

-- AddForeignKey
ALTER TABLE "rider_documents" ADD CONSTRAINT "rider_documents_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_documents" ADD CONSTRAINT "rider_documents_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "rider_document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_documents" ADD CONSTRAINT "rider_documents_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_deposit_entries" ADD CONSTRAINT "rider_deposit_entries_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_deposit_entries" ADD CONSTRAINT "rider_deposit_entries_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_deposit_orders" ADD CONSTRAINT "rider_deposit_orders_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Starting document list. Super Admin edits / adds to it; PCC is built in.
INSERT INTO "rider_document_types" ("id", "code", "name", "description", "isMandatory", "isActive", "requiresNumber", "requiresIssuer", "requiresIssueDate", "requiresExpiry", "isSystem", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, 'DRIVING_LICENCE', 'Driving licence', 'Front and back of a valid driving licence.', true, true, true, false, false, true, false, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ID_PROOF', 'Aadhaar / photo ID', 'Aadhaar card or another government photo ID.', true, true, true, false, false, false, false, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PCC', 'Police Clearance Certificate', 'Police verification / clearance certificate issued for you.', true, true, true, true, true, false, true, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'VEHICLE_RC', 'Vehicle registration (RC)', 'Registration certificate of the vehicle you ride.', false, true, true, false, false, false, false, 4, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- The licence / ID photo riders uploaded at sign-up becomes a driving-licence
-- submission waiting for review, so nothing already sent has to be sent again.
INSERT INTO "rider_documents" ("id", "riderId", "typeId", "fileUrls", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."id", t."id", ARRAY[r."documentUrl"], 'PENDING', r."updatedAt", CURRENT_TIMESTAMP
FROM "riders" r
JOIN "rider_document_types" t ON t."code" = 'DRIVING_LICENCE'
WHERE r."documentUrl" IS NOT NULL AND r."documentUrl" <> '';
