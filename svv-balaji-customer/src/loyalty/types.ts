import type { UserRole } from '../auth/CustomerAuthContext';

/**
 * The loyalty program's rules, expressed as data rather than scattered
 * constants, so `loyaltyRules.ts` is the one place that defines "how many
 * points does this order earn" and every screen reads the same answer.
 *
 * Mock-data only, same as the rest of Phase 4 sales screens — see
 * PROJECT_STATE.md. There is no `/api/v1/loyalty/*` yet. Swap this module's
 * calculations for a real API response once one exists; the screens are
 * written against `useLoyalty()`, not against these functions directly.
 */

export type LoyaltyTierKey = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface LoyaltyTierDef {
  key: LoyaltyTierKey;
  label: string;
  /** Lifetime points earned (never reduced by redemption) needed to hold this tier. */
  minLifetimePoints: number;
  /** Extra share of base points this tier earns, e.g. 1.25 = 25% bonus. */
  multiplierBonus: number;
  perks: string[];
  color: string;
}

export type LoyaltyTransactionType = 'EARNED' | 'REDEEMED' | 'EXPIRED';

export interface LoyaltyTransaction {
  id: string;
  type: LoyaltyTransactionType;
  points: number;
  title: string;
  subtitle: string;
  date: string;
}

export interface LoyaltyRoleState {
  points: number;
  lifetimePoints: number;
  transactions: LoyaltyTransaction[];
}

export interface LoyaltyOrderLine {
  productName: string;
  price: number;
  quantity: number;
}

export interface LoyaltyApi {
  role: UserRole;
  tier: LoyaltyTierDef;
  nextTier: LoyaltyTierDef | null;
  pointsToNextTier: number;
  progressToNextTier: number;
  points: number;
  lifetimePoints: number;
  pointsValueInr: number;
  transactions: LoyaltyTransaction[];

  /** Points a given line would earn right now, at the active role's rate. Used for on-page "Earn X pts" hints. */
  estimateLinePoints(price: number, quantity?: number): number;
  /** Points the whole order (already tier-bonused) would earn, for a checkout preview. */
  estimateOrderPoints(lines: LoyaltyOrderLine[]): number;

  /** Actually credits the points for a placed order. Called once, at the moment the order is confirmed. */
  earnForOrder(orderId: string, lines: LoyaltyOrderLine[]): number;
  /** Converts points to a rupee value and debits the balance. Returns the rupee value redeemed, or null if the request was invalid. */
  redeemPoints(points: number): number | null;
}
