import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * The affiliate arithmetic and rules, with no database and no framework.
 *
 * Money is integer paise throughout (same rule as checkout.calculator.ts), so
 * a commission, its partial reversals and the payout that includes it always
 * add up to the paisa.
 */

const paise = (rupees: number) => Math.round(rupees * 100);
const rupees = (p: number) => p / 100;
export const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ rates

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

export type RateSource = 'CATEGORY' | 'PARENT_CATEGORY' | 'DEFAULT';

export interface ResolvedRate {
  ratePercent: number;
  source: RateSource;
  /** The category the rate was read from (null for DEFAULT). */
  fromCategoryId: string | null;
}

/**
 * The item's own category rate, else the nearest ancestor's, else the program
 * default. Cycles cannot happen (CategoriesService refuses them) but the walk
 * is bounded anyway, so bad data can never hang checkout.
 */
export function resolveRate(
  categoryId: string | null,
  categories: Map<string, CategoryNode>,
  rates: Map<string, number>,
  defaultRatePercent: number,
): ResolvedRate {
  let id = categoryId;
  for (let depth = 0; id && depth < 10; depth += 1) {
    const rate = rates.get(id);
    if (rate !== undefined) return { ratePercent: rate, source: depth === 0 ? 'CATEGORY' : 'PARENT_CATEGORY', fromCategoryId: id };
    id = categories.get(id)?.parentId ?? null;
  }
  return { ratePercent: defaultRatePercent, source: 'DEFAULT', fromCategoryId: null };
}

// ------------------------------------------------------------------ base amounts

/** Split `total` paise across weights exactly (largest remainder). Mirrors checkout.calculator. */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if (floors[i] < weights[i]) {
      floors[i] += 1;
      left -= 1;
    }
  }
  return floors;
}

export interface BaseLineInput {
  key: string;
  quantity: number;
  unitPrice: number;
}

export interface BaseLine {
  key: string;
  /** unitPrice x quantity, pre-GST. */
  gross: number;
  /** This line's share of the order coupon. */
  couponShare: number;
  /** gross - couponShare: what commission is calculated on. */
  base: number;
}

/**
 * Commission base per line: (price x quantity) - the line's share of the
 * coupon. The coupon is spread pro-rata to line value, the same way checkout
 * spreads it for GST, so the shares add up to the coupon exactly. GST, the
 * delivery fee and loyalty/referral coin redemptions are not deducted - they
 * are not part of "item price" and not a coupon.
 */
export function commissionBases(lines: BaseLineInput[], couponDiscount: number): BaseLine[] {
  const grossP = lines.map((l) => paise(l.unitPrice) * l.quantity);
  const couponP = Math.min(paise(Math.max(0, couponDiscount)), grossP.reduce((a, b) => a + b, 0));
  const shares = apportion(couponP, grossP);
  return lines.map((l, i) => ({
    key: l.key,
    gross: rupees(grossP[i]),
    couponShare: rupees(shares[i]),
    base: rupees(grossP[i] - shares[i]),
  }));
}

/** Commission on a base at a %, rounded to the paisa. */
export function commissionFor(base: number, ratePercent: number): number {
  if (base <= 0 || ratePercent <= 0) return 0;
  return rupees(Math.round((paise(base) * ratePercent) / 100));
}

/**
 * How much commission to take back when `returnQty` more units of a line come
 * back. Pro-rata per unit; the last unit returned takes whatever is left, so a
 * fully returned line always nets to exactly zero.
 */
export function deductionFor(input: {
  commissionAmount: number;
  refundedAmount: number;
  quantity: number;
  refundedQuantity: number;
  returnQty: number;
}): { quantity: number; amount: number; fullyRefunded: boolean } {
  const remainingQty = input.quantity - input.refundedQuantity;
  const qty = Math.max(0, Math.min(input.returnQty, remainingQty));
  if (qty === 0) return { quantity: 0, amount: 0, fullyRefunded: remainingQty <= 0 };
  const leftP = paise(input.commissionAmount) - paise(input.refundedAmount);
  const fullyRefunded = qty === remainingQty;
  const amountP = fullyRefunded ? leftP : Math.min(leftP, Math.round((paise(input.commissionAmount) * qty) / input.quantity));
  return { quantity: qty, amount: rupees(Math.max(0, amountP)), fullyRefunded };
}

/** What a commission is still worth: amount minus what returns took back. */
export const netCommission = (c: { commissionAmount: number; refundedAmount: number }) =>
  rupees(paise(c.commissionAmount) - paise(c.refundedAmount));

// ------------------------------------------------------------------ hold window

const DAY = 24 * 60 * 60_000;

export const releaseDateFor = (orderDate: Date, holdDays: number) => new Date(orderDate.getTime() + holdDays * DAY);

/**
 * How long one line's commission is held. A product with its own return
 * window (frozen on the order line) holds for exactly that window, counted
 * from delivery - the commission matures when the customer can no longer
 * return it. Products without one use the program's hold (Affiliate Settings).
 * A 0-day window (not returnable) matures as soon as it is delivered.
 */
export function holdFor(
  lineReturnWindowDays: number | null | undefined,
  s: { holdDays: number; holdFrom: 'ORDER_DATE' | 'DELIVERY_DATE' },
): { holdDays: number; holdFrom: 'ORDER_DATE' | 'DELIVERY_DATE' } {
  if (lineReturnWindowDays === null || lineReturnWindowDays === undefined) return { holdDays: s.holdDays, holdFrom: s.holdFrom };
  return { holdDays: lineReturnWindowDays, holdFrom: 'DELIVERY_DATE' };
}

/**
 * May a PENDING commission become payable? Only once the order is DELIVERED
 * (nothing can be returned before then, so "past the return window" means
 * nothing earlier), its release date has passed, and - when the hold counts
 * from delivery - the delivery is at least `holdDays` old. An item with a
 * return still open waits for that return to settle.
 */
export function canMature(input: {
  now: Date;
  releaseDate: Date;
  orderStatus: string;
  deliveredAt: Date | null;
  holdFrom: 'ORDER_DATE' | 'DELIVERY_DATE';
  holdDays: number;
  openReturn: boolean;
}): boolean {
  if (input.orderStatus !== 'DELIVERED' || input.openReturn) return false;
  if (input.releaseDate > input.now) return false;
  if (input.holdFrom === 'DELIVERY_DATE') {
    if (!input.deliveredAt) return false;
    return releaseDateFor(input.deliveredAt, input.holdDays) <= input.now;
  }
  return true;
}

// ------------------------------------------------------------------ self-referral

/** Last 10 digits: +91 98765-43210, 919876543210 and 9876543210 are one number. */
export function normPhone(v: string | null | undefined): string | null {
  const digits = (v ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function normEmail(v: string | null | undefined): string | null {
  const e = (v ?? '').trim().toLowerCase();
  return e.includes('@') ? e : null;
}

export function normUpi(v: string | null | undefined): string | null {
  const u = (v ?? '').trim().toLowerCase();
  return u.includes('@') ? u : null;
}

export interface BuyerIdentity {
  customerId: string;
  phones: Array<string | null | undefined>;
  emails: Array<string | null | undefined>;
  /** This payment's fingerprints ("upi:...", "token:...", "phone:...", "email:..."). */
  paymentFingerprints: string[];
}

export interface AffiliateIdentity {
  customerId: string | null;
  phones: Array<string | null | undefined>;
  emails: Array<string | null | undefined>;
  payoutUpiId: string | null;
  /** Fingerprints of every payment the affiliate made as a shopper. */
  paymentFingerprints: string[];
}

export type FraudReason = 'SAME_CUSTOMER' | 'PHONE_MATCH' | 'EMAIL_MATCH' | 'PAYMENT_MATCH';

/**
 * The self-referral check. Any one match is enough: the buyer IS the affiliate
 * (same shopper record), or shares a phone or email with them (checked across
 * the buyer's account, shipping address and payment contact), or paid with an
 * instrument the affiliate has used (UPI id, saved-card token) or the UPI id
 * the affiliate gets paid on.
 */
export function selfReferralReasons(buyer: BuyerIdentity, aff: AffiliateIdentity): { reasons: FraudReason[]; detail: string[] } {
  const reasons = new Set<FraudReason>();
  const detail: string[] = [];
  if (aff.customerId && aff.customerId === buyer.customerId) {
    reasons.add('SAME_CUSTOMER');
    detail.push('buyer is the affiliate\'s own shopper account');
  }

  const fpPhones = buyer.paymentFingerprints.filter((f) => f.startsWith('phone:')).map((f) => f.slice(6));
  const fpEmails = buyer.paymentFingerprints.filter((f) => f.startsWith('email:')).map((f) => f.slice(6));
  const affPhones = new Set(aff.phones.map(normPhone).filter((x): x is string => !!x));
  const affEmails = new Set(aff.emails.map(normEmail).filter((x): x is string => !!x));
  for (const p of [...buyer.phones, ...fpPhones].map(normPhone)) {
    if (p && affPhones.has(p)) {
      reasons.add('PHONE_MATCH');
      detail.push(`phone ending ${p.slice(-4)}`);
      break;
    }
  }
  for (const e of [...buyer.emails, ...fpEmails].map(normEmail)) {
    if (e && affEmails.has(e)) {
      reasons.add('EMAIL_MATCH');
      detail.push(`email ${maskEmail(e)}`);
      break;
    }
  }

  // Instruments only: a payment's contact phone/email were compared above.
  const instruments = (fps: string[]) => fps.filter((f) => f.startsWith('upi:') || f.startsWith('token:') || f.startsWith('card:'));
  const affInstruments = new Set(instruments(aff.paymentFingerprints));
  const payoutUpi = normUpi(aff.payoutUpiId);
  if (payoutUpi) affInstruments.add(`upi:${payoutUpi}`);
  for (const f of instruments(buyer.paymentFingerprints)) {
    if (affInstruments.has(f)) {
      reasons.add('PAYMENT_MATCH');
      detail.push(`same payment instrument (${f.split(':')[0]})`);
      break;
    }
  }
  return { reasons: [...reasons], detail };
}

function maskEmail(e: string): string {
  const [user, domain] = e.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

// ------------------------------------------------------------------ codes & cookies

/** e.g. "RAUNAK" + 4 random chars -> "RAUNAK7K2Q". Letters/digits only, no look-alikes. */
export function affiliateCode(name: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const stem = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'SVV';
  let tail = '';
  for (let i = 0; i < 4; i += 1) tail += alphabet[randomInt(alphabet.length)];
  return `${stem}${tail}`;
}

export const AFFILIATE_COOKIE = 'aff_tracker';

/** Cookie value: "<clickId>.<hmac>". A forged or edited value fails verification. */
export function signClickId(clickId: string, secret: string): string {
  return `${clickId}.${createHmac('sha256', secret).update(clickId).digest('base64url')}`;
}

export function verifyClickCookie(value: string | null | undefined, secret: string): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const expected = Buffer.from(signClickId(id, secret).slice(dot + 1));
  const given = Buffer.from(value.slice(dot + 1));
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** Reads one cookie from a raw Cookie header (no cookie-parser in this app). */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export const hashIp = (ip: string | undefined | null) => (ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : null);
