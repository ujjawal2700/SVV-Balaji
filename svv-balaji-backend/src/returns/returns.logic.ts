import { FulfillmentMethod, ReturnLogistics, ReturnRequestStatus as S, ReturnRequestType } from '@prisma/client';

/**
 * Returns & exchanges arithmetic and rules. Pure functions, no database, so
 * every rule the workflow relies on is unit-tested directly (returns.logic.spec.ts).
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Statuses that still hold a claim on the item's quantity (anything not dead). */
export const OPEN_STATUSES: S[] = [
  S.REQUESTED, S.APPROVED, S.PICKUP_SCHEDULED, S.PICKED_UP, S.QC, S.REFUND_INITIATED,
  S.REPLACEMENT_PROCESSING, S.SHIPPED, S.DELIVERED, S.PICKUP_FAILED, S.DELIVERY_FAILED,
];
/** Statuses whose quantity is spent for good (the item really came back / was swapped). */
export const CONSUMING_STATUSES: S[] = [...OPEN_STATUSES, S.COMPLETED];
/** Dead ends: the quantity is free to be requested again. QC_FAILED is final for the claim but the goods came back. */
export const RELEASING_STATUSES: S[] = [S.REJECTED, S.CANCELLED];

/**
 * Every move the workflow may make. Anything not listed is refused, which is
 * what stops a status endpoint skipping pickup, QC or payment.
 */
const TRANSITIONS: Record<S, S[]> = {
  [S.REQUESTED]: [S.APPROVED, S.REJECTED, S.CANCELLED],
  // -> PICKED_UP: the customer handed it in at the store instead of waiting for a pickup.
  [S.APPROVED]: [S.PICKUP_SCHEDULED, S.PICKED_UP, S.CANCELLED],
  [S.PICKUP_SCHEDULED]: [S.PICKED_UP, S.PICKUP_FAILED, S.CANCELLED, S.QC, S.REFUND_INITIATED, S.REPLACEMENT_PROCESSING],
  [S.PICKED_UP]: [S.QC, S.REFUND_INITIATED, S.REPLACEMENT_PROCESSING],
  [S.PICKUP_FAILED]: [S.PICKUP_SCHEDULED, S.PICKED_UP, S.CANCELLED],
  [S.QC]: [S.REFUND_INITIATED, S.REPLACEMENT_PROCESSING, S.QC_FAILED],
  [S.REFUND_INITIATED]: [S.COMPLETED],
  [S.REPLACEMENT_PROCESSING]: [S.SHIPPED, S.REFUND_INITIATED],
  [S.SHIPPED]: [S.DELIVERED, S.DELIVERY_FAILED],
  [S.DELIVERY_FAILED]: [S.REPLACEMENT_PROCESSING, S.REFUND_INITIATED],
  [S.DELIVERED]: [S.COMPLETED],
  [S.COMPLETED]: [],
  [S.REJECTED]: [],
  [S.QC_FAILED]: [],
  [S.CANCELLED]: [],
};

export function canTransition(from: S, to: S): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Which reverse-logistics path an order's returns take - from how it was delivered. */
export function logisticsFor(method: FulfillmentMethod | null, warehouseKind: string | null): ReturnLogistics {
  if (method === FulfillmentMethod.LOCAL) return ReturnLogistics.QUICK_DELIVERY;
  if (method === FulfillmentMethod.SHIPROCKET) return ReturnLogistics.SHIPROCKET;
  // Staff-placed orders carry no method: an outlet's are local, the depot's go by courier.
  return warehouseKind === 'OUTLET' ? ReturnLogistics.QUICK_DELIVERY : ReturnLogistics.SHIPROCKET;
}

export interface WindowCheck {
  ok: boolean;
  /** When the window closes (null when the order was never delivered). */
  closesAt: Date | null;
  reason: string | null;
}

/** Window counted from the ACTUAL delivery time. */
export function windowCheck(deliveredAt: Date | null, windowHours: number, now = new Date()): WindowCheck {
  if (!deliveredAt) return { ok: false, closesAt: null, reason: 'The order has not been delivered' };
  const closesAt = new Date(deliveredAt.getTime() + windowHours * 3600_000);
  if (now > closesAt) return { ok: false, closesAt, reason: `The ${windowLabel(windowHours)} window closed on ${closesAt.toISOString()}` };
  return { ok: true, closesAt, reason: null };
}

export function windowLabel(hours: number): string {
  return hours % 24 === 0 ? `${hours / 24}-day` : `${hours}-hour`;
}

/** How many of a line are still free to request (ordered - live/complete requests). */
export function remainingQuantity(ordered: number, requests: Array<{ quantity: number; status: S }>): number {
  const taken = requests.filter((r) => CONSUMING_STATUSES.includes(r.status) || r.status === S.QC_FAILED).reduce((n, r) => n + r.quantity, 0);
  return Math.max(0, ordered - taken);
}

export interface LineFacts {
  quantity: number;
  /** After coupon/coin discounts, incl. GST - what the customer actually paid for the line. */
  lineTotal: number;
  /** Before discounts (unit x qty) - the base coin redemptions were spread over. */
  lineSubtotal: number;
}

export interface OrderFacts {
  subtotal: number;
  loyaltyRedeemedPoints: number;
  referralRedeemedPoints: number;
}

/** Paid value of `qty` units of a line. The last units take the rounding remainder. */
export function paidValue(line: LineFacts, qty: number): { unitPaid: number; itemValue: number } {
  const unitPaid = round2(line.lineTotal / line.quantity);
  const itemValue = qty === line.quantity ? round2(line.lineTotal) : round2(unitPaid * qty);
  return { unitPaid, itemValue };
}

/**
 * Coins redeemed on the order that belong to `qty` units of this line. Coin
 * redemptions are spread over lines pro rata to their pre-discount subtotal
 * (checkout.calculator), so they come back the same way. Floored: a
 * fraction of a coin is never invented.
 */
export function coinsForLine(order: OrderFacts, line: LineFacts, qty: number): { loyalty: number; referral: number } {
  if (order.subtotal <= 0 || line.quantity <= 0) return { loyalty: 0, referral: 0 };
  const share = (line.lineSubtotal / order.subtotal) * (qty / line.quantity);
  return {
    loyalty: Math.floor(order.loyaltyRedeemedPoints * share + 1e-9),
    referral: Math.floor(order.referralRedeemedPoints * share + 1e-9),
  };
}

export interface DeductionPolicy {
  shippingPayer: 'COMPANY' | 'CUSTOMER';
  shippingFee: number;
  restockingFeePercent: number;
}

/**
 * A return's refund: what was paid for the units, less the policy's
 * deductions - which are waived when the reason is the company's fault
 * (damaged, wrong item, defective). Never negative.
 */
export function refundFor(itemValue: number, companyFault: boolean, p: DeductionPolicy) {
  const shippingFee = companyFault || p.shippingPayer === 'COMPANY' ? 0 : round2(Math.min(p.shippingFee, itemValue));
  const restockingFee = companyFault ? 0 : round2(Math.min((itemValue * p.restockingFeePercent) / 100, itemValue - shippingFee));
  const refundAmount = round2(Math.max(0, itemValue - shippingFee - restockingFee));
  return { shippingFee, restockingFee, refundAmount };
}

/** GST-inclusive price of `qty` units at an exclusive unit price. */
export function inclusiveTotal(unitPriceExclusive: number, gstRatePercent: number, qty: number): number {
  return round2(unitPriceExclusive * qty * (1 + gstRatePercent / 100));
}

/**
 * Price difference of an exchange. Swapping for the SAME product costs
 * nothing either way - the customer already paid for it, and charging today's
 * undiscounted price would claw back their coupon. A different product is
 * priced at today's rate against what was actually paid.
 */
export function exchangeDifference(input: { sameProduct: boolean; itemValue: number; replacementTotal: number }): number {
  if (input.sameProduct) return 0;
  return round2(input.replacementTotal - input.itemValue);
}

/** Split returned packs across the batches the line was fulfilled from, oldest allocation first. */
export function batchesForReturn(
  allocations: Array<{ fgBatchId: string; quantity: number }>,
  alreadyReturned: Map<string, number>,
  qty: number,
): Array<{ fgBatchId: string; quantity: number }> {
  // A batch can appear on several allocation rows; Map keeps first-seen order.
  const perBatch = new Map<string, number>();
  for (const a of allocations) perBatch.set(a.fgBatchId, (perBatch.get(a.fgBatchId) ?? 0) + a.quantity);

  const out: Array<{ fgBatchId: string; quantity: number }> = [];
  let left = qty;
  for (const [fgBatchId, allocated] of perBatch) {
    if (left <= 0) break;
    const free = allocated - (alreadyReturned.get(fgBatchId) ?? 0);
    if (free <= 0) continue;
    const take = Math.min(free, left);
    out.push({ fgBatchId, quantity: take });
    left -= take;
  }
  return out;
}

export const STATUS_LABEL: Record<S, string> = {
  [S.REQUESTED]: 'Requested',
  [S.APPROVED]: 'Approved',
  [S.PICKUP_SCHEDULED]: 'Pickup scheduled',
  [S.PICKED_UP]: 'Picked up',
  [S.QC]: 'Received - quality check',
  [S.REFUND_INITIATED]: 'Refund initiated',
  [S.REPLACEMENT_PROCESSING]: 'Replacement processing',
  [S.SHIPPED]: 'Replacement shipped',
  [S.DELIVERED]: 'Replacement delivered',
  [S.COMPLETED]: 'Completed',
  [S.REJECTED]: 'Rejected',
  [S.PICKUP_FAILED]: 'Pickup failed',
  [S.QC_FAILED]: 'Quality check failed',
  [S.DELIVERY_FAILED]: 'Replacement delivery failed',
  [S.CANCELLED]: 'Cancelled',
};

export const typeLabel = (t: ReturnRequestType) => (t === ReturnRequestType.RETURN ? 'Return' : 'Exchange');
