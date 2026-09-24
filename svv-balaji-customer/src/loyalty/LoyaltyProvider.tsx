import { useQuery } from '@tanstack/react-query';
import { createContext, useMemo, type ReactNode } from 'react';
import { loyaltyApi } from '../api/loyalty';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import type { LoyaltyApi } from './types';

export const LOYALTY_QUERY_KEY = ['storefront', 'loyalty'] as const;

export const LoyaltyContext = createContext<LoyaltyApi | null>(null);

/**
 * The signed-in account's points balance and history, read from the server.
 *
 * Points are credited when an order is DELIVERED and reversed on returns, so
 * this refetches on window focus and every couple of minutes rather than
 * trusting a local copy: what a shopper sees is what the ledger says.
 * A guest has no balance; nothing is fetched for them.
 */
export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const { role } = useCustomerAuth();
  const signedIn = role !== 'GUEST';

  const query = useQuery({
    queryKey: [...LOYALTY_QUERY_KEY, role],
    queryFn: () => loyaltyApi.summary(),
    enabled: signedIn,
    staleTime: 30_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });

  const value = useMemo<LoyaltyApi>(() => {
    const s = query.data;
    return {
      isLoading: signedIn && query.isLoading,
      enabled: signedIn && Boolean(s?.enabled),
      points: signedIn ? (s?.balance ?? 0) : 0,
      loyaltyPoints: signedIn ? (s?.loyaltyBalance ?? 0) : 0,
      referralCoins: signedIn ? (s?.referralBalance ?? 0) : 0,
      pointsValueInr: signedIn ? (s?.balanceValueInr ?? 0) : 0,
      lifetimePoints: signedIn ? (s?.lifetimeEarned ?? 0) : 0,
      program: signedIn ? (s?.program ?? null) : null,
      expiringSoon: signedIn ? (s?.expiringSoon ?? null) : null,
      history: signedIn ? (s?.history ?? []) : [],
    };
  }, [query.data, query.isLoading, signedIn]);

  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>;
}
