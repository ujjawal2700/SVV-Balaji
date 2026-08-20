import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pricingApi } from '../api/pricing';
import { queryKeys } from '../api/queryKeys';
import type { CreatePriceListInput, PriceListQuery, SupersedePriceInput } from '../api/types';

export function usePriceLists(query: PriceListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.priceLists.list(query),
    queryFn: () => pricingApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function usePriceComparison(productId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.priceLists.comparison(productId ?? ''),
    queryFn: () => pricingApi.comparison(productId as string),
    enabled: Boolean(productId),
  });
}

export function useCreatePrice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePriceListInput) => pricingApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.priceLists.all });
    },
  });
}

/**
 * The only way to change a price.
 *
 * Does not invalidate orders: existing orders hold the rate they were placed
 * at, by design. Only a draft placed after this point picks up the new rate,
 * and placing re-reads the list server-side anyway.
 */
export function useSupersedePrice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupersedePriceInput }) =>
      pricingApi.supersede(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.priceLists.all });
    },
  });
}

export function useSetPriceActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      pricingApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.priceLists.all });
    },
  });
}
