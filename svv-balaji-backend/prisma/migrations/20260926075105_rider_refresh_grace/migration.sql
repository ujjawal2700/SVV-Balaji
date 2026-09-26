-- AlterTable
ALTER TABLE "rider_sessions" ADD COLUMN     "previousRefreshHash" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMP(3);
