-- Client decision 10 Oct 2026: quick-delivery offers go by weight - each rider
-- enters how much they can carry - and Super Admin can pay per kg.

-- AlterEnum
ALTER TYPE "EarningRuleKind" ADD VALUE 'PER_KG';

-- AlterEnum
ALTER TYPE "RiderEarningType" ADD VALUE 'WEIGHT';

-- AlterTable
ALTER TABLE "riders" ADD COLUMN     "maxCarryKg" DECIMAL(6,2);
