-- Riders get 60 s (was 45 s) to accept a delivery request. Only a setting
-- still on the old default moves; a value Super Admin chose is kept.
ALTER TABLE "delivery_settings" ALTER COLUMN "offerTimeoutSeconds" SET DEFAULT 60;
UPDATE "delivery_settings" SET "offerTimeoutSeconds" = 60 WHERE "offerTimeoutSeconds" = 45;
