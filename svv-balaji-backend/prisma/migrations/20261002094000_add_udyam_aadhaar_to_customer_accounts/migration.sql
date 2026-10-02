-- Add udyamRegistration and aadhaar to customer_accounts
-- Also add pan and aadhaar to customers (if not already present)
ALTER TABLE "customer_accounts"
  ADD COLUMN IF NOT EXISTS "udyamRegistration" TEXT,
  ADD COLUMN IF NOT EXISTS "aadhaar"           TEXT;

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "udyamRegistration" TEXT,
  ADD COLUMN IF NOT EXISTS "pan"               TEXT,
  ADD COLUMN IF NOT EXISTS "aadhaar"           TEXT;
