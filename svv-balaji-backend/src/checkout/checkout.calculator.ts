/**
 * The checkout arithmetic, with no database and no framework.
 *
 * Everything the customer is charged is decided here, on the server, from
 * prices the server resolved. Money is integer paise throughout, so a total
 * never drifts by a paisa between the quote, the payment and the invoice.
 *
 * GST is charged on what the customer actually pays for the goods, i.e. AFTER
 * discounts: the order-level discount (coupon + loyalty points) is spread over
 * the lines pro-rata to their value, and each line's tax is computed on what is
 * left. The delivery fee is a flat, GST-inclusive charge and carries no extra tax.
 */

export type Method = 'LOCAL' | 'SHIPROCKET';

export interface PriceLineInput {
  key: string;
  quantity: number;
  /** Per pack, before GST. */
  unitPrice: number;
  gstRatePercent: number;
}

export interface PricedLine {
  key: string;
  quantity: number;
  unitPrice: number;
  gstRatePercent: number;
  /** quantity x unitPrice, before discount and tax. */
  gross: number;
  /** This line's share of the order-level discount. */
  discount: number;
  taxable: number;
  tax: number;
  /** taxable + tax. */
  total: number;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  /** subtotal - discount + tax, i.e. what the goods cost the customer. */
  goodsTotal: number;
  deliveryFee: number;
  totalPayable: number;
}

const paise = (rupees: number) => Math.round(rupees * 100);
const rupees = (p: number) => p / 100;

/** Split `total` paise across weights, exactly (largest remainder), never exceeding each weight. */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if (floors[i] < weights[i]) {
      floors[i] += 1;
      left -= 1;
    }
  }
  return floors;
}

export function priceCart(lines: PriceLineInput[], orderDiscount: number, deliveryFee: number): PricedCart {
  const grossP = lines.map((l) => paise(l.unitPrice) * l.quantity);
  const subtotalP = grossP.reduce((a, b) => a + b, 0);
  const discountP = Math.min(paise(orderDiscount), subtotalP);
  const shares = apportion(discountP, grossP);

  const priced = lines.map((l, i) => {
    const taxableP = grossP[i] - shares[i];
    const taxP = Math.round((taxableP * l.gstRatePercent) / 100);
    return {
      key: l.key,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      gstRatePercent: l.gstRatePercent,
      gross: rupees(grossP[i]),
      discount: rupees(shares[i]),
      taxable: rupees(taxableP),
      tax: rupees(taxP),
      total: rupees(taxableP + taxP),
    } satisfies PricedLine;
  });

  const taxableP = priced.reduce((a, l) => a + paise(l.taxable), 0);
  const taxP = priced.reduce((a, l) => a + paise(l.tax), 0);
  const feeP = paise(deliveryFee);
  return {
    lines: priced,
    subtotal: rupees(subtotalP),
    discount: rupees(discountP),
    taxable: rupees(taxableP),
    tax: rupees(taxP),
    goodsTotal: rupees(taxableP + taxP),
    deliveryFee: rupees(feeP),
    totalPayable: rupees(taxableP + taxP + feeP),
  };
}

// --- Coupons & points -----------------------------------------------------

export interface CouponTerms {
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount: number | null;
}

/** Discount a coupon gives on a subtotal. Never more than the subtotal. */
export function couponDiscount(coupon: CouponTerms, subtotal: number): number {
  const subP = paise(subtotal);
  let d = coupon.type === 'PERCENT' ? Math.floor((subP * coupon.value) / 100) : paise(coupon.value);
  if (coupon.type === 'PERCENT' && coupon.maxDiscount !== null) d = Math.min(d, paise(coupon.maxDiscount));
  return rupees(Math.max(0, Math.min(d, subP)));
}

/**
 * Most points a customer may spend on this order: their balance, capped at
 * `maxPercent` of the value the points can pay for, and at least `minPoints`
 * or nothing. Whole points only.
 */
export function maxRedeemablePoints(input: {
  balance: number;
  payableBase: number;
  maxPercent: number;
  pointValueInr: number;
  minPoints: number;
}): number {
  if (input.pointValueInr <= 0 || input.balance <= 0) return 0;
  const capInr = (input.payableBase * input.maxPercent) / 100;
  const byCap = Math.floor(capInr / input.pointValueInr);
  const usable = Math.min(Math.floor(input.balance), byCap);
  return usable >= Math.max(1, input.minPoints) ? usable : 0;
}

// --- Delivery fee, ETA, distance -----------------------------------------------

export interface FeeSettings {
  localBaseFee: number;
  localFreeAbove: number | null;
  shipBaseFee: number;
  shipFreeAbove: number | null;
  b2bBaseFee: number;
  b2bFreeAbove: number | null;
}

/** Fee for the goods total (after discounts). Free above the method's threshold. */
export function deliveryFeeFor(method: Method, b2b: boolean, goodsTotal: number, s: FeeSettings): number {
  const [base, freeAbove] = b2b
    ? [s.b2bBaseFee, s.b2bFreeAbove]
    : method === 'LOCAL'
      ? [s.localBaseFee, s.localFreeAbove]
      : [s.shipBaseFee, s.shipFreeAbove];
  return freeAbove !== null && goodsTotal >= freeAbove ? 0 : base;
}

export interface EtaSettings {
  prepMinutes: number;
  minutesPerKm: number;
  shipMinDays: number;
  shipMaxDays: number;
}

/**
 * LOCAL: prep time + travel time, with a 15-minute window either side of the
 * estimate. SHIPROCKET: a min-max day window from the order date.
 */
export function etaWindow(
  method: Method,
  distanceKm: number | null,
  now: Date,
  s: EtaSettings,
): { min: Date; max: Date; label: string } {
  if (method === 'LOCAL') {
    const minutes = s.prepMinutes + Math.ceil((distanceKm ?? 0) * s.minutesPerKm);
    const min = new Date(now.getTime() + minutes * 60_000);
    const max = new Date(now.getTime() + (minutes + 15) * 60_000);
    return { min, max, label: `${minutes}-${minutes + 15} min` };
  }
  const day = 24 * 60 * 60_000;
  return {
    min: new Date(now.getTime() + s.shipMinDays * day),
    max: new Date(now.getTime() + s.shipMaxDays * day),
    label: `${s.shipMinDays}-${s.shipMaxDays} days`,
  };
}

const R_EARTH_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function validCoordinates(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}
