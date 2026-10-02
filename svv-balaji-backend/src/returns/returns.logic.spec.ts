import { ReturnLogistics, ReturnRequestStatus as S } from '@prisma/client';
import {
  batchesForReturn, canTransition, coinsForLine, exchangeDifference, inclusiveTotal, logisticsFor, paidValue, refundFor, remainingQuantity,
  windowCheck,
} from './returns.logic';

describe('returns.logic', () => {
  describe('window (from ACTUAL delivery)', () => {
    const delivered = new Date('2026-10-01T10:00:00Z');
    it('is open inside the window and closed after it', () => {
      expect(windowCheck(delivered, 48, new Date('2026-10-03T09:59:00Z')).ok).toBe(true);
      const late = windowCheck(delivered, 48, new Date('2026-10-03T10:01:00Z'));
      expect(late.ok).toBe(false);
      expect(late.closesAt?.toISOString()).toBe('2026-10-03T10:00:00.000Z');
    });
    it('is never open for an order that was not delivered', () => {
      expect(windowCheck(null, 168).ok).toBe(false);
    });
  });

  describe('remaining quantity (duplicates / partial returns)', () => {
    it('counts open and completed requests, frees rejected and cancelled ones', () => {
      expect(remainingQuantity(5, [])).toBe(5);
      expect(remainingQuantity(5, [{ quantity: 2, status: S.REQUESTED }])).toBe(3);
      expect(remainingQuantity(5, [{ quantity: 2, status: S.COMPLETED }, { quantity: 3, status: S.PICKUP_SCHEDULED }])).toBe(0);
      expect(remainingQuantity(5, [{ quantity: 2, status: S.REJECTED }, { quantity: 1, status: S.CANCELLED }])).toBe(5);
    });
    it('a QC-failed claim still consumed the goods (they came back)', () => {
      expect(remainingQuantity(3, [{ quantity: 1, status: S.QC_FAILED }])).toBe(2);
    });
  });

  describe('paid value after discounts', () => {
    const line = { quantity: 3, lineTotal: 100, lineSubtotal: 120 };
    it('pro-rates what was paid, last units absorbing the rounding', () => {
      expect(paidValue(line, 1)).toEqual({ unitPaid: 33.33, itemValue: 33.33 });
      expect(paidValue(line, 3).itemValue).toBe(100);
    });
  });

  describe('coins redeemed on the order', () => {
    it('come back pro rata to the line subtotal and quantity, floored', () => {
      const order = { subtotal: 400, loyaltyRedeemedPoints: 100, referralRedeemedPoints: 30 };
      // line is 1/4 of the order; half its quantity returned -> 1/8
      expect(coinsForLine(order, { quantity: 2, lineTotal: 90, lineSubtotal: 100 }, 1)).toEqual({ loyalty: 12, referral: 3 });
    });
    it('are zero when nothing was redeemed', () => {
      expect(coinsForLine({ subtotal: 100, loyaltyRedeemedPoints: 0, referralRedeemedPoints: 0 }, { quantity: 1, lineTotal: 100, lineSubtotal: 100 }, 1))
        .toEqual({ loyalty: 0, referral: 0 });
    });
  });

  describe('refund deductions', () => {
    const policy = { shippingPayer: 'CUSTOMER' as const, shippingFee: 40, restockingFeePercent: 10 };
    it('deducts shipping and restocking on a change-of-mind return', () => {
      expect(refundFor(200, false, policy)).toEqual({ shippingFee: 40, restockingFee: 20, refundAmount: 140 });
    });
    it('waives every deduction when it is the company fault (damaged / wrong item)', () => {
      expect(refundFor(200, true, policy)).toEqual({ shippingFee: 0, restockingFee: 0, refundAmount: 200 });
    });
    it('company-paid shipping deducts nothing for shipping and never goes negative', () => {
      expect(refundFor(200, false, { ...policy, shippingPayer: 'COMPANY' }).shippingFee).toBe(0);
      expect(refundFor(10, false, { shippingPayer: 'CUSTOMER', shippingFee: 40, restockingFeePercent: 50 }).refundAmount).toBe(0);
    });
  });

  describe('exchange price difference', () => {
    it('same product costs nothing either way (the coupon is not clawed back)', () => {
      expect(exchangeDifference({ sameProduct: true, itemValue: 80, replacementTotal: 105 })).toBe(0);
    });
    it('a dearer product is paid for, a cheaper one is a credit', () => {
      expect(exchangeDifference({ sameProduct: false, itemValue: 80, replacementTotal: inclusiveTotal(100, 5, 1) })).toBe(25);
      expect(exchangeDifference({ sameProduct: false, itemValue: 120, replacementTotal: 105 })).toBe(-15);
    });
  });

  describe('transitions', () => {
    it('cannot skip pickup, QC or payment', () => {
      expect(canTransition(S.REQUESTED, S.REFUND_INITIATED)).toBe(false);
      expect(canTransition(S.APPROVED, S.COMPLETED)).toBe(false);
      expect(canTransition(S.REPLACEMENT_PROCESSING, S.DELIVERED)).toBe(false);
      expect(canTransition(S.QC, S.REFUND_INITIATED)).toBe(true);
      expect(canTransition(S.COMPLETED, S.CANCELLED)).toBe(false);
    });
    it('a failed pickup can be rescheduled', () => {
      expect(canTransition(S.PICKUP_FAILED, S.PICKUP_SCHEDULED)).toBe(true);
    });
  });

  it('logistics follow how the order was delivered', () => {
    expect(logisticsFor('LOCAL', 'OUTLET')).toBe(ReturnLogistics.QUICK_DELIVERY);
    expect(logisticsFor('SHIPROCKET', 'CENTRAL')).toBe(ReturnLogistics.SHIPROCKET);
    expect(logisticsFor(null, 'OUTLET')).toBe(ReturnLogistics.QUICK_DELIVERY);
    expect(logisticsFor(null, 'CENTRAL')).toBe(ReturnLogistics.SHIPROCKET);
  });

  describe('returned packs back to their batches (traceability)', () => {
    it('fills the line allocations oldest first, net of earlier returns', () => {
      const allocations = [{ fgBatchId: 'A', quantity: 2 }, { fgBatchId: 'B', quantity: 3 }, { fgBatchId: 'A', quantity: 1 }];
      expect(batchesForReturn(allocations, new Map(), 4)).toEqual([{ fgBatchId: 'A', quantity: 3 }, { fgBatchId: 'B', quantity: 1 }]);
      expect(batchesForReturn(allocations, new Map([['A', 3]]), 2)).toEqual([{ fgBatchId: 'B', quantity: 2 }]);
    });
    it('returns short when the packs cannot all be matched', () => {
      expect(batchesForReturn([{ fgBatchId: 'A', quantity: 1 }], new Map(), 2)).toEqual([{ fgBatchId: 'A', quantity: 1 }]);
    });
  });
});
