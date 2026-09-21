import {
  couponDiscount,
  deliveryFeeFor,
  etaWindow,
  haversineKm,
  maxRedeemablePoints,
  priceCart,
  validCoordinates,
} from './checkout.calculator';

const line = (key: string, quantity: number, unitPrice: number, gst = 5) => ({ key, quantity, unitPrice, gstRatePercent: gst });

describe('priceCart', () => {
  it('prices a simple cart: subtotal, GST, delivery, total', () => {
    const c = priceCart([line('a', 2, 100), line('b', 1, 50, 12)], 0, 30);
    expect(c.subtotal).toBe(250);
    expect(c.tax).toBe(16); // 10 (5% of 200) + 6 (12% of 50)
    expect(c.goodsTotal).toBe(266);
    expect(c.totalPayable).toBe(296);
  });

  it('charges GST after the discount, spread pro-rata across lines', () => {
    const c = priceCart([line('a', 1, 600), line('b', 1, 400)], 100, 0);
    expect(c.lines.map((l) => l.discount)).toEqual([60, 40]);
    expect(c.taxable).toBe(900);
    expect(c.tax).toBe(45); // 5% of 900, not of 1000
    expect(c.totalPayable).toBe(945);
  });

  it('always allocates the discount exactly, with no lost paisa', () => {
    const c = priceCart([line('a', 1, 33.33), line('b', 1, 33.33), line('c', 1, 33.34)], 10, 0);
    expect(c.lines.reduce((n, l) => Math.round((n + l.discount) * 100) / 100, 0)).toBe(10);
    expect(c.discount).toBe(10);
  });

  it('never discounts below zero: the discount is capped at the subtotal', () => {
    const c = priceCart([line('a', 1, 100)], 500, 20);
    expect(c.discount).toBe(100);
    expect(c.taxable).toBe(0);
    expect(c.totalPayable).toBe(20); // only delivery left
  });

  it('keeps line totals and cart totals consistent', () => {
    const c = priceCart([line('a', 3, 19.99), line('b', 7, 4.5, 18)], 12.34, 45);
    const sum = c.lines.reduce((n, l) => n + Math.round(l.total * 100), 0);
    expect(sum).toBe(Math.round(c.goodsTotal * 100));
    expect(Math.round(c.totalPayable * 100)).toBe(Math.round((c.goodsTotal + c.deliveryFee) * 100));
  });
});

describe('couponDiscount', () => {
  it('percent coupon, capped by maxDiscount', () => {
    expect(couponDiscount({ type: 'PERCENT', value: 10, maxDiscount: null }, 1000)).toBe(100);
    expect(couponDiscount({ type: 'PERCENT', value: 10, maxDiscount: 60 }, 1000)).toBe(60);
  });
  it('fixed coupon, never more than the subtotal', () => {
    expect(couponDiscount({ type: 'FIXED', value: 50, maxDiscount: null }, 499)).toBe(50);
    expect(couponDiscount({ type: 'FIXED', value: 500, maxDiscount: null }, 120)).toBe(120);
  });
});

describe('maxRedeemablePoints', () => {
  const base = { payableBase: 1000, maxPercent: 50, pointValueInr: 1, minPoints: 0 };
  it('is capped by the balance and by the percent-of-order limit', () => {
    expect(maxRedeemablePoints({ ...base, balance: 200 })).toBe(200);
    expect(maxRedeemablePoints({ ...base, balance: 900 })).toBe(500);
  });
  it('honours the point value', () => {
    expect(maxRedeemablePoints({ ...base, balance: 5000, pointValueInr: 0.25 })).toBe(2000);
  });
  it('is zero below the minimum, or with no balance', () => {
    expect(maxRedeemablePoints({ ...base, balance: 40, minPoints: 100 })).toBe(0);
    expect(maxRedeemablePoints({ ...base, balance: 0 })).toBe(0);
  });
});

describe('deliveryFeeFor', () => {
  const s = { localBaseFee: 30, localFreeAbove: 499, shipBaseFee: 60, shipFreeAbove: 999, b2bBaseFee: 150, b2bFreeAbove: 5000 };
  it('charges the method fee and waives it above the threshold', () => {
    expect(deliveryFeeFor('LOCAL', false, 300, s)).toBe(30);
    expect(deliveryFeeFor('LOCAL', false, 499, s)).toBe(0);
    expect(deliveryFeeFor('SHIPROCKET', false, 500, s)).toBe(60);
    expect(deliveryFeeFor('SHIPROCKET', false, 1000, s)).toBe(0);
  });
  it('B2B has its own schedule', () => {
    expect(deliveryFeeFor('SHIPROCKET', true, 3000, s)).toBe(150);
    expect(deliveryFeeFor('SHIPROCKET', true, 5000, s)).toBe(0);
  });
  it('null threshold means never free', () => {
    expect(deliveryFeeFor('LOCAL', false, 1e9, { ...s, localFreeAbove: null })).toBe(30);
  });
});

describe('etaWindow', () => {
  const s = { prepMinutes: 30, minutesPerKm: 4, shipMinDays: 3, shipMaxDays: 6 };
  const now = new Date('2026-09-21T10:00:00Z');
  it('LOCAL = prep + travel, with a 15 minute window', () => {
    const e = etaWindow('LOCAL', 2.5, now, s); // 30 + ceil(10) = 40
    expect(e.label).toBe('40-55 min');
    expect(e.min.toISOString()).toBe('2026-09-21T10:40:00.000Z');
    expect(e.max.toISOString()).toBe('2026-09-21T10:55:00.000Z');
  });
  it('SHIPROCKET = a day window', () => {
    const e = etaWindow('SHIPROCKET', null, now, s);
    expect(e.label).toBe('3-6 days');
    expect(e.min.toISOString()).toBe('2026-09-24T10:00:00.000Z');
  });
});

describe('geo', () => {
  it('haversine: Bhopal to Sehore is about 35 km; identical points are 0', () => {
    const bhopal = { lat: 23.2599, lng: 77.4126 };
    const sehore = { lat: 23.2032, lng: 77.0844 };
    const d = haversineKm(bhopal, sehore);
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(40);
    expect(haversineKm(bhopal, bhopal)).toBe(0);
  });
  it('validates coordinates, rejecting null island and out-of-range values', () => {
    expect(validCoordinates(23.25, 77.41)).toBe(true);
    expect(validCoordinates(0, 0)).toBe(false);
    expect(validCoordinates(91, 10)).toBe(false);
    expect(validCoordinates('23', 77)).toBe(false);
  });
});
