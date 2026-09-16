import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import {
  MIN_REDEEM_POINTS,
  POINTS_TO_INR,
  estimateLineBasePoints,
  estimateOrderPoints as computeOrderPoints,
  nextTierFor,
  seedStateFor,
  tierForLifetimePoints,
} from './loyaltyRules';
import type { LoyaltyApi, LoyaltyOrderLine, LoyaltyRoleState, LoyaltyTransaction } from './types';

/**
 * Two independent point pools, one per role — same split as `customerProfile`
 * / `retailerProfile` in CustomerAuthContext. A shopper who registers as a
 * wholesale partner does not walk in with their personal Desi Wallet points;
 * the two loyalty ledgers are as separate as the two price lists.
 *
 * Persisted in the browser only, same reasoning as CartProvider: there is no
 * `/api/v1/loyalty/*` yet (Phase 4 sales is still customers/pricing/sales —
 * see PROJECT_STATE.md), so this is the record of truth for the demo. Swap
 * this module for API calls once the backend exists; screens read `useLoyalty()`,
 * not this file.
 */

const LOYALTY_STORAGE_KEY = 'svv.customer.loyalty';
const LOYALTY_VERSION = 1;

interface StoredLoyalty {
  version: number;
  CUSTOMER: LoyaltyRoleState;
  RETAILER: LoyaltyRoleState;
}

function readStoredLoyalty(): StoredLoyalty {
  try {
    const raw = window.localStorage.getItem(LOYALTY_STORAGE_KEY);
    if (!raw) throw new Error('no stored state');
    const parsed = JSON.parse(raw) as StoredLoyalty;
    if (parsed?.version !== LOYALTY_VERSION || !parsed.CUSTOMER || !parsed.RETAILER) {
      throw new Error('stale shape');
    }
    return parsed;
  } catch {
    return { version: LOYALTY_VERSION, CUSTOMER: seedStateFor('CUSTOMER'), RETAILER: seedStateFor('RETAILER') };
  }
}

export const LoyaltyContext = createContext<LoyaltyApi | null>(null);

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const { role } = useCustomerAuth();
  const activeRole = role === 'RETAILER' ? 'RETAILER' : 'CUSTOMER';

  const [state, setState] = useState<StoredLoyalty>(() => readStoredLoyalty());

  useEffect(() => {
    try {
      window.localStorage.setItem(LOYALTY_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* private browsing can throw on write; the session still works from memory */
    }
  }, [state]);

  const roleState = state[activeRole];

  const tier = useMemo(() => tierForLifetimePoints(roleState.lifetimePoints, activeRole), [roleState.lifetimePoints, activeRole]);
  const nextTier = useMemo(() => nextTierFor(tier, activeRole), [tier, activeRole]);
  const pointsToNextTier = nextTier ? Math.max(0, nextTier.minLifetimePoints - roleState.lifetimePoints) : 0;
  const progressToNextTier = nextTier
    ? Math.min(1, (roleState.lifetimePoints - tier.minLifetimePoints) / (nextTier.minLifetimePoints - tier.minLifetimePoints))
    : 1;

  /**
   * Tier bonus included, so this always matches what `earnForOrder` will actually
   * credit — a product-page hint that undercounts what checkout later awards
   * would read as a bug, not a rounding nuance.
   */
  const estimateLinePoints = useCallback(
    (price: number, quantity = 1) => Math.round(estimateLineBasePoints(price, quantity, activeRole) * tier.multiplierBonus),
    [activeRole, tier],
  );

  const estimateOrderPointsFn = useCallback(
    (lines: LoyaltyOrderLine[]) => computeOrderPoints(lines, activeRole, tier),
    [activeRole, tier],
  );

  const earnForOrder = useCallback(
    (orderId: string, lines: LoyaltyOrderLine[]) => {
      const earned = computeOrderPoints(lines, activeRole, tier);
      if (earned <= 0) return 0;

      const txn: LoyaltyTransaction = {
        id: `earn-${Date.now()}`,
        type: 'EARNED',
        points: earned,
        title: `Order #${orderId}`,
        subtitle: 'Points earned on this order',
        date: 'Just now',
      };

      setState((current) => {
        const prev = current[activeRole];
        return {
          ...current,
          [activeRole]: {
            points: prev.points + earned,
            lifetimePoints: prev.lifetimePoints + earned,
            transactions: [txn, ...prev.transactions],
          },
        };
      });

      return earned;
    },
    [activeRole, tier],
  );

  const redeemPoints = useCallback(
    (points: number) => {
      if (!Number.isFinite(points) || points <= 0) return null;
      if (points < MIN_REDEEM_POINTS) return null;
      if (points > roleState.points) return null;

      const value = Math.round(points * POINTS_TO_INR);
      const txn: LoyaltyTransaction = {
        id: `redeem-${Date.now()}`,
        type: 'REDEEMED',
        points: -points,
        title: activeRole === 'RETAILER' ? 'Redeemed to B2B wallet' : 'Redeemed to wallet',
        subtitle: `₹${value.toLocaleString('en-IN')} credited to your wallet`,
        date: 'Just now',
      };

      setState((current) => {
        const prev = current[activeRole];
        return {
          ...current,
          [activeRole]: {
            ...prev,
            points: prev.points - points,
            transactions: [txn, ...prev.transactions],
          },
        };
      });

      return value;
    },
    [activeRole, roleState.points],
  );

  const value = useMemo<LoyaltyApi>(
    () => ({
      role: activeRole,
      tier,
      nextTier,
      pointsToNextTier,
      progressToNextTier,
      points: roleState.points,
      lifetimePoints: roleState.lifetimePoints,
      pointsValueInr: Math.round(roleState.points * POINTS_TO_INR),
      transactions: roleState.transactions,
      estimateLinePoints,
      estimateOrderPoints: estimateOrderPointsFn,
      earnForOrder,
      redeemPoints,
    }),
    [activeRole, tier, nextTier, pointsToNextTier, progressToNextTier, roleState, estimateLinePoints, estimateOrderPointsFn, earnForOrder, redeemPoints],
  );

  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>;
}
