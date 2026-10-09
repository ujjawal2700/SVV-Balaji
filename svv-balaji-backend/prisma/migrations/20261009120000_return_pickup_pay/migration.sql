-- Super Admin sets what a rider earns for a return pickup (see earning.logic.ts).
ALTER TYPE "EarningRuleKind" ADD VALUE IF NOT EXISTS 'RETURN_PICKUP_PAY';
