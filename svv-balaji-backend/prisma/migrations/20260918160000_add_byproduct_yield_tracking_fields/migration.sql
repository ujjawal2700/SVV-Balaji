-- AlterTable
ALTER TABLE "cleaning_grading_records" ADD COLUMN     "byProductName" TEXT,
ADD COLUMN     "byProductQuantity" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "production_batches" ADD COLUMN     "byProductName" TEXT,
ADD COLUMN     "byProductQuantity" DECIMAL(12,2),
ADD COLUMN     "byProductRevenue" DECIMAL(12,2);

