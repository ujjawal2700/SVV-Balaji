import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { batchesApi, collectionsApi } from '../api/collections';
import { queryKeys } from '../api/queryKeys';
import type { BatchStatus, CreateCollectionInput, PaymentStatus } from '../api/types';

export function useCollections(filters: { farmerId?: string; branchId?: string }) {
  return useQuery({
    queryKey: queryKeys.collections.list(filters),
    queryFn: () => collectionsApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Collecting a harvest mints a batch, consumes the inspection, and (when a
 * warehouse is named) books stock and writes a ledger row — so it invalidates
 * rather more than itself.
 */
export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCollectionInput) => collectionsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      // The inspection is now spent - it must drop out of the eligible list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
    },
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateCollectionInput> }) =>
      collectionsApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => collectionsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
    },
  });
}

export function useSetPaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: PaymentStatus }) =>
      collectionsApi.setPaymentStatus(id, paymentStatus),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
    },
  });
}

export function useBatches(filters: {
  farmerId?: string;
  status?: BatchStatus;
  warehouseId?: string;
}) {
  return useQuery({
    queryKey: queryKeys.batches.list(filters),
    queryFn: () => batchesApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useBatchTrace(batchNumber: string | undefined) {
  return useQuery({
    queryKey: queryKeys.batches.trace(batchNumber ?? ''),
    queryFn: () => batchesApi.trace(batchNumber as string),
    enabled: Boolean(batchNumber),
  });
}
