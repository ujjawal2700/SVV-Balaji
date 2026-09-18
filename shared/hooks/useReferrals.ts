import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { referralsApi } from '../api/referrals';
import { queryKeys } from '../api/queryKeys';
import type { AdjustCoinBalanceInput, ReferralQuery } from '../api/types';

export function useReferrals(query: ReferralQuery = {}) {
  return useQuery({
    queryKey: queryKeys.referrals.list(query),
    queryFn: () => referralsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useCoinLedger(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.referrals.ledger(customerId ?? ''),
    queryFn: () => referralsApi.ledger(customerId as string),
    enabled: customerId !== null,
  });
}

/**
 * Invalidates both the ledger for the customer just adjusted and the
 * referral list - a corrected balance can change what a row would show if
 * it's ever surfaced there too, and the two screens should never disagree.
 */
export function useAdjustCoinBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: AdjustCoinBalanceInput }) =>
      referralsApi.adjust(customerId, input),
    onSuccess: (_data, { customerId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.referrals.ledger(customerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.referrals.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}
