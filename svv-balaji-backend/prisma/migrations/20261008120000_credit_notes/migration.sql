-- CreateEnum
CREATE TYPE "CreditNoteReason" AS ENUM ('SALES_RETURN', 'POST_SALE_DISCOUNT', 'DEFICIENCY_IN_SERVICES', 'CORRECTION_IN_INVOICE', 'CHANGE_IN_POS', 'FINALIZATION_OF_PROVISIONAL_ASSESSMENT', 'OTHERS');

-- AlterTable
ALTER TABLE "gst_settings" ADD COLUMN     "creditNotePrefix" TEXT NOT NULL DEFAULT 'CN';

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "noteDate" TIMESTAMP(3) NOT NULL,
    "financialYear" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "returnRequestId" TEXT,
    "customerId" TEXT,
    "channel" "SalesChannel" NOT NULL,
    "supplyType" "InvoiceSupplyType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "reason" "CreditNoteReason" NOT NULL,
    "remark" TEXT,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "placeOfSupply" TEXT NOT NULL,
    "isInterState" BOOLEAN NOT NULL,
    "taxableTotal" DECIMAL(14,2) NOT NULL,
    "cgstTotal" DECIMAL(14,2) NOT NULL,
    "sgstTotal" DECIMAL(14,2) NOT NULL,
    "igstTotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "eInvoiceStatus" "EInvoiceStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "irn" TEXT,
    "ackNo" TEXT,
    "ackDate" TIMESTAMP(3),
    "signedQrCode" TEXT,
    "eInvoiceProvider" TEXT,
    "eInvoiceError" TEXT,
    "eInvoiceAttempts" INTEGER NOT NULL DEFAULT 0,
    "eInvoiceNextAttemptAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "sku" TEXT,
    "hsnSac" TEXT,
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "quantity" DECIMAL(12,3) NOT NULL,
    "uqc" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxableValue" DECIMAL(14,2) NOT NULL,
    "gstRatePercent" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(14,2) NOT NULL,
    "sgstAmount" DECIMAL(14,2) NOT NULL,
    "igstAmount" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_noteNumber_key" ON "credit_notes"("noteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_returnRequestId_key" ON "credit_notes"("returnRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_irn_key" ON "credit_notes"("irn");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_customerId_idx" ON "credit_notes"("customerId");

-- CreateIndex
CREATE INDEX "credit_notes_noteDate_idx" ON "credit_notes"("noteDate");

-- CreateIndex
CREATE INDEX "credit_notes_status_idx" ON "credit_notes"("status");

-- CreateIndex
CREATE INDEX "credit_notes_eInvoiceStatus_idx" ON "credit_notes"("eInvoiceStatus");

-- CreateIndex
CREATE INDEX "credit_note_lines_invoiceLineId_idx" ON "credit_note_lines"("invoiceLineId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_lines_creditNoteId_lineNo_key" ON "credit_note_lines"("creditNoteId", "lineNo");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

