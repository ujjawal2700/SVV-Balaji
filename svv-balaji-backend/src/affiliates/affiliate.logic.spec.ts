import {
  affiliateCode, canMature, commissionBases, commissionFor, deductionFor, netCommission, readCookie, releaseDateFor, resolveRate,
  selfReferralReasons, signClickId, verifyClickCookie, type CategoryNode,
} from './affiliate.logic';

describe('affiliate.logic', () => {
  describe('resolveRate', () => {
    const cats = new Map<string, CategoryNode>([
      ['staples', { id: 'staples', name: 'Staples', parentId: null }],
      ['atta', { id: 'atta', name: 'Atta', parentId: 'staples' }],
      ['masala', { id: 'masala', name: 'Masalas', parentId: null }],
      ['garam', { id: 'garam', name: 'Garam masala', parentId: 'masala' }],
    ]);
    const rates = new Map([['staples', 1.5], ['masala', 6], ['garam', 8]]);

    it('uses the category\'s own rate', () => {
      expect(resolveRate('garam', cats, rates, 0)).toEqual({ ratePercent: 8, source: 'CATEGORY', fromCategoryId: 'garam' });
    });
    it('inherits the nearest parent\'s rate', () => {
      expect(resolveRate('atta', cats, rates, 0)).toEqual({ ratePercent: 1.5, source: 'PARENT_CATEGORY', fromCategoryId: 'staples' });
    });
    it('falls back to the default for an unrated or missing category', () => {
      expect(resolveRate('unknown', cats, rates, 2)).toEqual({ ratePercent: 2, source: 'DEFAULT', fromCategoryId: null });
      expect(resolveRate(null, cats, rates, 0).source).toBe('DEFAULT');
    });
    it('cannot loop on a corrupt cycle', () => {
      const loop = new Map<string, CategoryNode>([['a', { id: 'a', name: 'A', parentId: 'b' }], ['b', { id: 'b', name: 'B', parentId: 'a' }]]);
      expect(resolveRate('a', loop, new Map(), 3).ratePercent).toBe(3);
    });
  });

  describe('commission base', () => {
    it('is price x qty minus the line\'s coupon share; shares add up to the coupon exactly', () => {
      const lines = commissionBases(
        [{ key: 'atta', quantity: 2, unitPrice: 300 }, { key: 'masala', quantity: 3, unitPrice: 100 }, { key: 'oil', quantity: 1, unitPrice: 33.33 }],
        100,
      );
      const coupon = lines.reduce((n, l) => n + Math.round(l.couponShare * 100), 0);
      expect(coupon).toBe(10000);
      for (const l of lines) expect(Math.round((l.gross - l.couponShare) * 100)).toBe(Math.round(l.base * 100));
      expect(lines[0].gross).toBe(600);
      expect(lines[1].gross).toBe(300);
    });
    it('without a coupon the base is the gross', () => {
      expect(commissionBases([{ key: 'x', quantity: 4, unitPrice: 12.5 }], 0)[0]).toEqual({ key: 'x', gross: 50, couponShare: 0, base: 50 });
    });
    it('a coupon bigger than the cart never makes a base negative', () => {
      const [l] = commissionBases([{ key: 'x', quantity: 1, unitPrice: 50 }], 80);
      expect(l.base).toBe(0);
    });
    it('commission is base x rate, to the paisa', () => {
      expect(commissionFor(600, 1.5)).toBe(9);
      expect(commissionFor(333.33, 8)).toBe(26.67);
      expect(commissionFor(100, 0)).toBe(0);
    });
  });

  describe('deductionFor (partial returns)', () => {
    const c = { commissionAmount: 10, refundedAmount: 0, quantity: 3, refundedQuantity: 0 };
    it('takes back a per-unit share', () => {
      expect(deductionFor({ ...c, returnQty: 1 })).toEqual({ quantity: 1, amount: 3.33, fullyRefunded: false });
    });
    it('the last unit takes the remainder, so a fully returned line nets to zero', () => {
      const first = deductionFor({ ...c, returnQty: 2 });
      expect(first.amount).toBe(6.67);
      const last = deductionFor({ ...c, refundedAmount: first.amount, refundedQuantity: 2, returnQty: 1 });
      expect(last).toEqual({ quantity: 1, amount: 3.33, fullyRefunded: true });
      expect(netCommission({ commissionAmount: 10, refundedAmount: first.amount + last.amount })).toBe(0);
    });
    it('never deducts more units than are left', () => {
      expect(deductionFor({ ...c, refundedQuantity: 3, refundedAmount: 10, returnQty: 1 })).toEqual({ quantity: 0, amount: 0, fullyRefunded: true });
      expect(deductionFor({ ...c, returnQty: 9 })).toEqual({ quantity: 3, amount: 10, fullyRefunded: true });
    });
  });

  describe('hold window', () => {
    const orderDate = new Date('2026-10-01T10:00:00Z');
    const release = releaseDateFor(orderDate, 7);
    const base = { releaseDate: release, orderStatus: 'DELIVERED', deliveredAt: new Date('2026-10-02T10:00:00Z'), holdFrom: 'ORDER_DATE' as const, holdDays: 7, openReturn: false };
    it('releases on order date + 7 days', () => {
      expect(release.toISOString()).toBe('2026-10-08T10:00:00.000Z');
      expect(canMature({ ...base, now: new Date('2026-10-08T09:59:59Z') })).toBe(false);
      expect(canMature({ ...base, now: new Date('2026-10-08T10:00:00Z') })).toBe(true);
    });
    it('never before delivery, nor while a return is open', () => {
      const now = new Date('2026-10-20T00:00:00Z');
      expect(canMature({ ...base, now, orderStatus: 'DISPATCHED', deliveredAt: null })).toBe(false);
      expect(canMature({ ...base, now, openReturn: true })).toBe(false);
    });
    it('DELIVERY_DATE mode also waits hold days after delivery', () => {
      const late = { ...base, holdFrom: 'DELIVERY_DATE' as const, deliveredAt: new Date('2026-10-06T10:00:00Z') };
      expect(canMature({ ...late, now: new Date('2026-10-09T00:00:00Z') })).toBe(false);
      expect(canMature({ ...late, now: new Date('2026-10-13T10:00:00Z') })).toBe(true);
    });
  });

  describe('selfReferralReasons', () => {
    const aff = { customerId: 'cust-aff', phones: ['+91 98765 43210'], emails: ['Aff@Example.com'], payoutUpiId: 'aff@okaxis', paymentFingerprints: ['upi:affold@ybl', 'token:token_ABC'] };
    const clean = { customerId: 'cust-buyer', phones: ['9123456780'], emails: ['buyer@example.com'], paymentFingerprints: ['upi:buyer@okhdfc'] };
    it('passes a genuine buyer', () => {
      expect(selfReferralReasons(clean, aff).reasons).toEqual([]);
    });
    it('flags the affiliate buying as themselves', () => {
      expect(selfReferralReasons({ ...clean, customerId: 'cust-aff' }, aff).reasons).toContain('SAME_CUSTOMER');
    });
    it('flags a shared phone in any format, incl. the shipping phone', () => {
      expect(selfReferralReasons({ ...clean, phones: ['9123456780', '919876543210'] }, aff).reasons).toEqual(['PHONE_MATCH']);
    });
    it('flags a shared email regardless of case', () => {
      expect(selfReferralReasons({ ...clean, emails: ['aff@example.COM '] }, aff).reasons).toEqual(['EMAIL_MATCH']);
    });
    it('flags a payment from the affiliate\'s UPI id, saved card or payout UPI', () => {
      expect(selfReferralReasons({ ...clean, paymentFingerprints: ['upi:affold@ybl'] }, aff).reasons).toEqual(['PAYMENT_MATCH']);
      expect(selfReferralReasons({ ...clean, paymentFingerprints: ['token:token_ABC'] }, aff).reasons).toEqual(['PAYMENT_MATCH']);
      expect(selfReferralReasons({ ...clean, paymentFingerprints: ['upi:aff@okaxis'] }, aff).reasons).toEqual(['PAYMENT_MATCH']);
    });
    it('compares the payment\'s contact phone/email too', () => {
      expect(selfReferralReasons({ ...clean, paymentFingerprints: ['phone:9876543210'] }, aff).reasons).toEqual(['PHONE_MATCH']);
    });
  });

  describe('cookie', () => {
    it('round-trips a signed click id and rejects tampering', () => {
      const v = signClickId('click-1', 's3cret');
      expect(verifyClickCookie(v, 's3cret')).toBe('click-1');
      expect(verifyClickCookie(v.replace('click-1', 'click-2'), 's3cret')).toBeNull();
      expect(verifyClickCookie(v, 'other')).toBeNull();
      expect(verifyClickCookie('garbage', 's3cret')).toBeNull();
    });
    it('reads one cookie out of a header', () => {
      expect(readCookie('a=1; aff_tracker=x.y%3D; b=2', 'aff_tracker')).toBe('x.y=');
      expect(readCookie(undefined, 'aff_tracker')).toBeNull();
    });
    it('codes are upper-case letters and digits', () => {
      expect(affiliateCode('Raunak Khanam')).toMatch(/^RAUNAK[A-Z2-9]{4}$/);
      expect(affiliateCode('123')).toMatch(/^SVV[A-Z2-9]{4}$/);
    });
  });
});
