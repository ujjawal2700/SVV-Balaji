import type { UserRole } from '../auth/CustomerAuthContext';
import type { LoyaltyRoleState, LoyaltyTierDef, LoyaltyTierKey, LoyaltyTransaction } from './types';

/**
 * Points scale with what the product costs, not a flat "1 point per order" —
 * a pricier bag of atta earns at a richer rate than a ₹25 spice packet. This
 * is the one place that decides the rate; every screen that shows or awards
 * points calls through here rather than re-deriving it.
 */
const PRICE_BAND_RATES: { max: number; pointsPer100: number }[] = [
  { max: 99, pointsPer100: 2 },
  { max: 299, pointsPer100: 3 },
  { max: 599, pointsPer100: 4 },
  { max: Infinity, pointsPer100: 5 },
];

/**
 * Wholesalers place fewer, larger orders than a household shopper, so the
 * per-rupee rate is richer for the B2B channel — the same shape as the
 * wholesale price list being channel-aware (see PROJECT_STATE.md §1,
 * Decision 1). Applied on top of the price-band rate, not instead of it.
 */
const ROLE_MULTIPLIER: Record<'CUSTOMER' | 'RETAILER', number> = {
  CUSTOMER: 1,
  RETAILER: 1.5,
};

export function pointsRatePer100(price: number): number {
  const band = PRICE_BAND_RATES.find((b) => price <= b.max) ?? PRICE_BAND_RATES[PRICE_BAND_RATES.length - 1];
  return band.pointsPer100;
}

export const PRICE_BAND_TABLE = PRICE_BAND_RATES;

function roleMultiplier(role: UserRole): number {
  return role === 'RETAILER' ? ROLE_MULTIPLIER.RETAILER : ROLE_MULTIPLIER.CUSTOMER;
}

/** Base points a single line (before any tier bonus) earns — the building block for both the per-product hint and the order total. */
export function estimateLineBasePoints(price: number, quantity: number, role: UserRole): number {
  if (price <= 0 || quantity <= 0) return 0;
  const rate = pointsRatePer100(price);
  const perUnit = (price * rate) / 100;
  return Math.round(perUnit * roleMultiplier(role) * quantity);
}

const CUSTOMER_TIERS: LoyaltyTierDef[] = [
  { key: 'BRONZE', label: 'Bronze Member', minLifetimePoints: 0, multiplierBonus: 1, color: '#a8785a', perks: ['Earn points on every order', 'Birthday bonus points'] },
  { key: 'SILVER', label: 'Silver Member', minLifetimePoints: 1000, multiplierBonus: 1.1, color: '#94a3b8', perks: ['10% bonus points on every order', 'Free delivery above ₹300'] },
  { key: 'GOLD', label: 'Gold Member', minLifetimePoints: 3000, multiplierBonus: 1.25, color: '#eab308', perks: ['25% bonus points on every order', 'Priority customer support', 'Early access to festive schemes'] },
  { key: 'PLATINUM', label: 'Platinum Member', minLifetimePoints: 7000, multiplierBonus: 1.5, color: '#7c3aed', perks: ['50% bonus points on every order', 'Dedicated support line', 'Exclusive Platinum-only offers'] },
];

const RETAILER_TIERS: LoyaltyTierDef[] = [
  { key: 'BRONZE', label: 'Bronze Partner', minLifetimePoints: 0, multiplierBonus: 1, color: '#a8785a', perks: ['Earn points on every wholesale order'] },
  { key: 'SILVER', label: 'Silver Partner', minLifetimePoints: 5000, multiplierBonus: 1.1, color: '#94a3b8', perks: ['10% bonus points on every order', 'Priority dispatch slot'] },
  { key: 'GOLD', label: 'Gold Partner', minLifetimePoints: 15000, multiplierBonus: 1.25, color: '#eab308', perks: ['25% bonus points on every order', 'Dedicated account manager', 'Extended credit review'] },
  { key: 'PLATINUM', label: 'Platinum Distributor', minLifetimePoints: 35000, multiplierBonus: 1.5, color: '#7c3aed', perks: ['50% bonus points on every order', 'First access to new schemes', 'Annual loyalty bonus payout'] },
];

export function tiersForRole(role: UserRole): LoyaltyTierDef[] {
  return role === 'RETAILER' ? RETAILER_TIERS : CUSTOMER_TIERS;
}

export function tierForLifetimePoints(lifetimePoints: number, role: UserRole): LoyaltyTierDef {
  const tiers = tiersForRole(role);
  return [...tiers].reverse().find((t) => lifetimePoints >= t.minLifetimePoints) ?? tiers[0];
}

export function nextTierFor(tier: LoyaltyTierDef, role: UserRole): LoyaltyTierDef | null {
  const tiers = tiersForRole(role);
  const idx = tiers.findIndex((t) => t.key === tier.key);
  return idx >= 0 && idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

/** Order total earned, tier bonus applied — what actually gets credited when an order is placed. */
export function estimateOrderPoints(
  lines: { price: number; quantity: number }[],
  role: UserRole,
  tier: LoyaltyTierDef,
): number {
  const base = lines.reduce((sum, l) => sum + estimateLineBasePoints(l.price, l.quantity, role), 0);
  return Math.round(base * tier.multiplierBonus);
}

/** 1 point = ₹0.25. A round, easy-to-explain conversion — see the redemption card on the loyalty page. */
export const POINTS_TO_INR = 0.25;
export const MIN_REDEEM_POINTS = 200;
export const REDEEM_STEP = 100;
export const MAX_REDEEM_SHARE_OF_ORDER = 0.5;
export const POINTS_VALID_MONTHS = 12;

const seedCustomerTransactions: LoyaltyTransaction[] = [
  { id: 'lc1', type: 'EARNED', points: 68, title: 'Order #ORD-89237492', subtitle: 'Points earned on this order', date: 'Today, 1:15 PM' },
  { id: 'lc2', type: 'REDEEMED', points: -200, title: 'Redeemed to wallet', subtitle: '₹50 credited to Desi Wallet', date: 'Yesterday, 6:40 PM' },
  { id: 'lc3', type: 'EARNED', points: 34, title: 'Order #ORD-54328912', subtitle: 'Points earned on this order', date: '28 Aug, 4:20 PM' },
  { id: 'lc4', type: 'EARNED', points: 100, title: 'Welcome Bonus', subtitle: 'New account reward', date: '1 Jan, 9:00 AM' },
];

const seedRetailerTransactions: LoyaltyTransaction[] = [
  { id: 'lr1', type: 'EARNED', points: 412, title: 'Order #ORD-WB-33210', subtitle: 'Points earned on this wholesale order', date: 'Today, 11:05 AM' },
  { id: 'lr2', type: 'EARNED', points: 265, title: 'Order #ORD-WB-33108', subtitle: 'Points earned on this wholesale order', date: '3 Sep, 3:40 PM' },
  { id: 'lr3', type: 'REDEEMED', points: -1000, title: 'Redeemed to B2B wallet', subtitle: '₹250 credited to B2B wallet', date: '29 Aug, 10:00 AM' },
];

const seedState: Record<'CUSTOMER' | 'RETAILER', LoyaltyRoleState> = {
  CUSTOMER: { points: 640, lifetimePoints: 1240, transactions: seedCustomerTransactions },
  RETAILER: { points: 3180, lifetimePoints: 6320, transactions: seedRetailerTransactions },
};

export function seedStateFor(role: 'CUSTOMER' | 'RETAILER'): LoyaltyRoleState {
  return seedState[role];
}

export function tierKeyColor(key: LoyaltyTierKey): string {
  return tiersForRole('CUSTOMER').find((t) => t.key === key)?.color ?? '#a8785a';
}
