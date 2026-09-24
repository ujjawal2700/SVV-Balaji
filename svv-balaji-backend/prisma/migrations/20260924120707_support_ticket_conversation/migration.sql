-- CreateEnum
CREATE TYPE "SupportMessageAuthor" AS ENUM ('CUSTOMER', 'STAFF');

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "support_ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "author" "SupportMessageAuthor" NOT NULL,
    "staffUserId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_ticket_messages_ticketId_createdAt_idx" ON "support_ticket_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_lastActivityAt_idx" ON "support_tickets"("lastActivityAt");

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing tickets' last activity is when they were raised (or resolved).
UPDATE "support_tickets" SET "lastActivityAt" = COALESCE("resolvedAt", "createdAt");

-- Backfill: a resolution note written before conversations existed becomes the
-- staff's reply in the thread, so the customer still sees it.
INSERT INTO "support_ticket_messages" ("id", "ticketId", "author", "staffUserId", "body", "createdAt")
SELECT gen_random_uuid()::text, t."id", 'STAFF', t."resolvedById", t."resolutionNote", COALESCE(t."resolvedAt", t."updatedAt")
FROM "support_tickets" t
WHERE t."resolutionNote" IS NOT NULL AND length(trim(t."resolutionNote")) > 0;
