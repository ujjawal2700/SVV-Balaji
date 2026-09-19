-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isDailyStaple" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTopPick" BOOLEAN NOT NULL DEFAULT false;

