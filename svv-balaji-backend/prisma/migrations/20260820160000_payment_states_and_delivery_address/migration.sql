-- FRD 26.4 payment states, and FRD 24.2 delivery address on the order.

-- --------------------------------------------------------------------------
-- FRD 26.4 requires four states; the enum had three. A failed payment had to be
-- recorded as PENDING, which put every bounced transaction into the same bucket
-- as "nobody has tried yet" and silently corrupted any receivables figure. A
-- refund had nowhere to go at all.
--
-- Adding values is additive and safe: no existing row changes, and PENDING
-- keeps its meaning. Postgres cannot add enum values inside a transaction block
-- in older versions, hence one statement per value.
-- --------------------------------------------------------------------------
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- --------------------------------------------------------------------------
-- FRD 24.2 lists Delivery Address as an order detail. It was only inferable
-- from the customer's current shippingAddress, so editing a customer silently
-- rewrote the delivery address of every order they had ever placed. Snapshot it
-- instead - the same reasoning that already denormalises `channel` onto the
-- order.
--
-- Nullable with no backfill. Existing orders genuinely do not know where they
-- were shipped; writing today's customer address onto them would be inventing
-- history rather than recording it, and would look authoritative while being
-- a guess.
-- --------------------------------------------------------------------------
ALTER TABLE "orders" ADD COLUMN "deliveryAddress" TEXT;
