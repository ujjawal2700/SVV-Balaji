-- Per-product return window (days after delivery; NULL = channel default, 0 = not returnable),
-- frozen onto each order line at placement. Also drives the affiliate commission hold.
ALTER TABLE "products" ADD COLUMN "returnWindowDays" INTEGER;
ALTER TABLE "order_items" ADD COLUMN "returnWindowDays" INTEGER;
