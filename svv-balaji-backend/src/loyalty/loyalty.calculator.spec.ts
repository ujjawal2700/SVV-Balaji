import {
  CalcLine,
  LoyaltyRules,
  computeEarn,
  isDiscounted,
  resolveEligibility,
  reversalDelta,
} from './loyalty.calculator';

const rules = (over: Partial<LoyaltyRules> = {}): LoyaltyRules => ({
  isActive: true,
  earnPercent: 5,
  pointValueInr: 1,
  calculationBase: 'EXCLUDING_TAX',
  defaultEligible: true,
  appliesToDiscountedProducts: true,
  minEligibleItemAmount: null,
  minEligibleOrderAmount: null,
  maxRewardPerOrderInr: null,
  ...over,
});

const line = (key: string, subtotal: number, over: Partial<CalcLine> = {}): CalcLine => ({
  key,
  quantity: 1,
  unitPrice: subtotal,
  gstRatePercent: 5,
  lineSubtotal: subtotal,
  lineTotal: Math.round(subtotal * 1.05 * 100) / 100,
  mrp: null,
  productEligibility: 'INHERIT',
  categoryEligibility: null,
  parentCategoryEligibility: null,
  ...over,
});

describe('computeEarn', () => {
  it('Rs 1,000 eligible at 5% earns Rs 50 = 50 points at Rs 1/point', () => {
    const r = computeEarn(rules(), [line('a', 1000)]);
    expect(r.eligibleAmount).toBe(1000);
    expect(r.points).toBe(50);
    expect(r.rewardInr).toBe(50);
  });

  it('honours a configurable point value: at Rs 0.25/point the same reward is 200 points', () => {
    const r = computeEarn(rules({ pointValueInr: 0.25 }), [line('a', 1000)]);
    expect(r.points).toBe(200);
    expect(r.rewardInr).toBe(50);
  });

  it('uses only eligible lines: the ineligible line contributes nothing', () => {
    const r = computeEarn(rules(), [line('a', 600), line('b', 400, { productEligibility: 'NOT_ELIGIBLE' })]);
    expect(r.eligibleAmount).toBe(600);
    expect(r.points).toBe(30);
    expect(r.lines[1]).toMatchObject({ eligible: false, ineligibleReason: 'PRODUCT_NOT_ELIGIBLE', points: 0 });
  });

  it('applies the base setting: excluding vs including GST', () => {
    expect(computeEarn(rules(), [line('a', 1000)]).points).toBe(50); // 5% of 1000
    expect(computeEarn(rules({ calculationBase: 'INCLUDING_TAX' }), [line('a', 1000)]).points).toBe(52); // 5% of 1050
  });

  it('has no float drift on awkward amounts', () => {
    // 5% of 199.99 = 9.9995 -> 999 paise -> 9 points at Rs 1; never 10 from rounding up.
    expect(computeEarn(rules(), [line('a', 199.99)]).points).toBe(9);
    expect(computeEarn(rules({ earnPercent: 2.5 }), [line('a', 1000)]).points).toBe(25);
  });

  it('skips with a stored reason: program off, zero rate, nothing eligible', () => {
    expect(computeEarn(rules({ isActive: false }), [line('a', 1000)])).toMatchObject({ points: 0, skipReason: 'PROGRAM_OFF' });
    expect(computeEarn(rules({ earnPercent: 0 }), [line('a', 1000)])).toMatchObject({ points: 0, skipReason: 'NO_RATE' });
    expect(computeEarn(rules(), [line('a', 1000, { productEligibility: 'NOT_ELIGIBLE' })])).toMatchObject({
      points: 0,
      skipReason: 'NO_ELIGIBLE_ITEMS',
    });
  });

  it('enforces the minimum eligible item amount per line', () => {
    const r = computeEarn(rules({ minEligibleItemAmount: 100 }), [line('a', 500), line('b', 80)]);
    expect(r.lines[1]).toMatchObject({ eligible: false, ineligibleReason: 'BELOW_MIN_ITEM' });
    expect(r.eligibleAmount).toBe(500);
  });

  it('enforces the minimum eligible order amount on the ELIGIBLE total, not the basket', () => {
    const basket = [line('a', 300), line('b', 900, { productEligibility: 'NOT_ELIGIBLE' })];
    expect(computeEarn(rules({ minEligibleOrderAmount: 500 }), basket)).toMatchObject({ points: 0, skipReason: 'BELOW_MIN_ORDER' });
    expect(computeEarn(rules({ minEligibleOrderAmount: 300 }), basket).points).toBe(15);
  });

  it('caps the reward per order and keeps the per-line audit summing to the total', () => {
    const r = computeEarn(rules({ maxRewardPerOrderInr: 40 }), [line('a', 600), line('b', 400)]); // uncapped 50
    expect(r.cappedByMax).toBe(true);
    expect(r.points).toBeLessThanOrEqual(40);
    expect(r.lines.reduce((n, l) => n + l.points, 0)).toBe(r.points);
    expect(r.rewardInr).toBeLessThanOrEqual(40);
  });

  it('does not cap when under the maximum', () => {
    const r = computeEarn(rules({ maxRewardPerOrderInr: 500 }), [line('a', 1000)]);
    expect(r.cappedByMax).toBe(false);
    expect(r.points).toBe(50);
  });

  describe('discounted products', () => {
    // Sold at Rs 90 + 5% GST = Rs 94.50 against an MRP of Rs 100.
    const sale = line('a', 90, { mrp: 100 });

    it('flags a line sold below MRP as discounted; at or above MRP is not', () => {
      expect(isDiscounted(sale)).toBe(true);
      expect(isDiscounted({ unitPrice: 100, gstRatePercent: 5, mrp: 105 })).toBe(false);
      expect(isDiscounted({ unitPrice: 100, gstRatePercent: 5, mrp: null })).toBe(false);
    });

    it('earns on discounted lines when the setting allows it, not when it does not', () => {
      expect(computeEarn(rules({ appliesToDiscountedProducts: true }), [sale]).points).toBe(4); // 5% of 90 = 4.5
      const off = computeEarn(rules({ appliesToDiscountedProducts: false }), [sale]);
      expect(off.lines[0]).toMatchObject({ eligible: false, ineligibleReason: 'DISCOUNTED' });
      expect(off.points).toBe(0);
    });
  });
});

describe('resolveEligibility cascade', () => {
  it('product override beats category beats parent beats default', () => {
    expect(resolveEligibility('NOT_ELIGIBLE', 'ELIGIBLE', 'ELIGIBLE', true)).toEqual({ eligible: false, source: 'PRODUCT' });
    expect(resolveEligibility('INHERIT', 'NOT_ELIGIBLE', 'ELIGIBLE', true)).toEqual({ eligible: false, source: 'CATEGORY' });
    expect(resolveEligibility('INHERIT', 'INHERIT', 'NOT_ELIGIBLE', true)).toEqual({ eligible: false, source: 'PARENT_CATEGORY' });
    expect(resolveEligibility('INHERIT', 'INHERIT', 'INHERIT', false)).toEqual({ eligible: false, source: 'DEFAULT' });
    expect(resolveEligibility('INHERIT', null, null, true)).toEqual({ eligible: true, source: 'DEFAULT' });
  });

  it('a product can opt IN under a category that opts out', () => {
    expect(resolveEligibility('ELIGIBLE', 'NOT_ELIGIBLE', null, true)).toEqual({ eligible: true, source: 'PRODUCT' });
  });
});

describe('reversalDelta', () => {
  it('is proportional to the quantity returned', () => {
    expect(reversalDelta(50, 5, 1, 0)).toBe(10);
    expect(reversalDelta(50, 5, 2, 10)).toBe(10); // cumulative 2 of 5 = 20, 10 already taken
  });

  it('a full return takes exactly what is left, never stranding a rounding point', () => {
    // 10 points over 3 packs: 1 pack = floor(3.33) = 3, 2 packs = 6, all 3 = 10.
    expect(reversalDelta(10, 3, 1, 0)).toBe(3);
    expect(reversalDelta(10, 3, 2, 3)).toBe(3);
    expect(reversalDelta(10, 3, 3, 6)).toBe(4);
  });

  it('never reverses twice for the same quantity and never goes negative', () => {
    expect(reversalDelta(50, 5, 5, 50)).toBe(0);
    expect(reversalDelta(0, 5, 5, 0)).toBe(0);
  });
});
