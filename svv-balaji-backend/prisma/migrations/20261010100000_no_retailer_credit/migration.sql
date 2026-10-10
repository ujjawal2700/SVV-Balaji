-- Client decision 10 Oct 2026: no credit for retailers. They pay online or
-- cash on delivery like consumers. Existing credit orders keep their own
-- paymentTerms (they are history); only the accounts change.
UPDATE "customers" SET "paymentTerms" = 'PREPAID', "creditLimit" = NULL
WHERE "paymentTerms" <> 'PREPAID' OR "creditLimit" IS NOT NULL;

-- Credit notes are no longer a refund choice for either channel.
UPDATE "return_settings"
SET "allowedRefundMethods" = array_remove("allowedRefundMethods", 'CREDIT_NOTE'::"RefundMethod")
WHERE 'CREDIT_NOTE'::"RefundMethod" = ANY("allowedRefundMethods");

UPDATE "return_settings" SET "allowedRefundMethods" = ARRAY['WALLET','UPI','BANK']::"RefundMethod"[]
WHERE cardinality("allowedRefundMethods") = 0;

UPDATE "return_settings" SET "defaultRefundMethod" = "allowedRefundMethods"[1]
WHERE "defaultRefundMethod" = 'CREDIT_NOTE' OR NOT ("defaultRefundMethod" = ANY("allowedRefundMethods"));
