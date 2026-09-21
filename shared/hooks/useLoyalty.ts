import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loyaltyApi } from '../api/loyalty';
import type { LoyaltyEligibility, RecordReturnInput, UpdateLoyaltySettingsInput } from '../api/loyalty';
import { queryKeys } from '../api/queryKeys';

export function useLoyaltySettings() {
  return useQuery({ queryKey: queryKeys.loyalty.settings, queryFn: () => loyaltyApi.getSettings() });
}

export function useUpdateLoyaltySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLoyaltySettingsInput) => loyaltyApi.updateSettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.loyalty.settings, settings);
      // Eligibility answers depend on the program default.
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyalty.eligibilityAll });
    },
  });
}

/** What a product with this setting, in this category, will actually do. Server-resolved. */
export function useLoyaltyEligibility(productEligibility: LoyaltyEligibility, categoryId?: string) {
  return useQuery({
    queryKey: queryKeys.loyalty.eligibility(productEligibility, categoryId ?? ''),
    queryFn: () => loyaltyApi.eligibility(productEligibility, categoryId),
  });
}

export function useLoyaltyOrderBreakdown(orderNumber: string | undefined) {
  return useQuery({
    queryKey: queryKeys.loyalty.order(orderNumber ?? ''),
    queryFn: () => loyaltyApi.orderBreakdown(orderNumber as string),
    enabled: Boolean(orderNumber),
  });
}

export function useRecordReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: RecordReturnInput }) =>
      loyaltyApi.recordReturn(orderId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyalty.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.referrals.all });
    },
  });
}
