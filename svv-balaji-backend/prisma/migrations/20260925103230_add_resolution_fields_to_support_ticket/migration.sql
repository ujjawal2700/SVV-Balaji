-- CreateEnum
CREATE TYPE "SupportResolutionAction" AS ENUM ('REFUND_APPROVED', 'REPLACEMENT_DISPATCHED', 'REVERSE_PICKUP', 'REJECTED');

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "evidenceImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "internalAuditNote" TEXT,
ADD COLUMN     "refundAmount" DECIMAL(10,2),
ADD COLUMN     "replacementOrderNumber" TEXT,
ADD COLUMN     "resolutionAction" "SupportResolutionAction";
