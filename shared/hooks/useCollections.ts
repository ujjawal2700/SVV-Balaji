import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { batchesApi, collectionsApi } from '../api/collections';
import { queryKeys } from '../api/queryKeys';
import type {
  BatchStatus,
  CreateCollectionInput,
  PaymentStatus,
  UpdateCollectionInput,
} from '../api/types';

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

/**
 * Correcting a collection's figures.
 *
 * A net weight change reaches the batch quantity, the warehouse stock line and
 * the movement ledger server-side, so this invalidates the warehouse tree as
 * well as its own - otherwise the occupancy figure and the ledger would still
 * be showing the old number.
 */
export function useUpdateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCollectionInput }) =>
      collectionsApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
    },
  });
}

/** Takes the batch, its stock line and its receipt movement with it. */
export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => collectionsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
      // The inspection becomes collectable again.
      void queryClient.invalidateQueries({ queryKey: queryKeys.inspections.all });
    },
  });
}
