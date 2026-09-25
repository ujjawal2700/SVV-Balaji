import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { seedStockApi } from '../api/seedStock';
import type { ReceiveSeedStockInput, SeedStockQuery, UpdateSeedStockInput } from '../api/types';

export function useSeedStock(query: SeedStockQuery = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.seedStock.list({ ...query }),
    queryFn: () => seedStockApi.list(query),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useSeedStockLot(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.seedStock.detail(id ?? ''),
    queryFn: () => seedStockApi.get(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Stock changes are visible on the handout list too (the lot a handout came
 * from), so every stock mutation refreshes the whole seed-distribution tree.
 */
function useInvalidateSeed() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.seedDistribution.all });
}

export function useReceiveSeedStock() {
  const invalidate = useInvalidateSeed();
  return useMutation({ mutationFn: (input: ReceiveSeedStockInput) => seedStockApi.receive(input), onSuccess: invalidate });
}

export function useTopUpSeedStock() {
  const invalidate = useInvalidateSeed();
  return useMutation({
    mutationFn: ({ id, quantity, reason }: { id: string; quantity: number; reason?: string }) =>
      seedStockApi.topUp(id, quantity, reason),
    onSuccess: invalidate,
  });
}

export function useAdjustSeedStock() {
  const invalidate = useInvalidateSeed();
  return useMutation({
    mutationFn: ({
      id,
      quantity,
      reason,
      kind,
    }: {
      id: string;
      quantity: number;
      reason: string;
      kind?: 'ADJUSTMENT' | 'WRITE_OFF';
    }) => seedStockApi.adjust(id, quantity, reason, kind),
    onSuccess: invalidate,
  });
}

export function useTransferSeedStock() {
  const invalidate = useInvalidateSeed();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; toBranchId: string; quantity: number; reason?: string }) =>
      seedStockApi.transfer(id, input),
    onSuccess: invalidate,
  });
}

export function useUpdateSeedStock() {
  const invalidate = useInvalidateSeed();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSeedStockInput }) => seedStockApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteSeedStock() {
  const invalidate = useInvalidateSeed();
  return useMutation({ mutationFn: (id: string) => seedStockApi.remove(id), onSuccess: invalidate });
}
