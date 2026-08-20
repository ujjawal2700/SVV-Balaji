import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { farmersApi } from '../api/farmers';
import { queryKeys } from '../api/queryKeys';
import type {
  CreateFarmerInput,
  FarmerQuery,
  SettableFarmerStatus,
  UpdateFarmerInput,
  VerifyFarmerInput,
} from '../api/types';

export function useFarmers(query: FarmerQuery) {
  return useQuery({
    queryKey: queryKeys.farmers.list(query),
    queryFn: () => farmersApi.list(query),
    // Keeps the previous page's rows on screen while a new filter loads, so the
    // table does not collapse to empty and jump on every keystroke.
    placeholderData: keepPreviousData,
  });
}

export function useFarmer(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farmers.detail(id ?? ''),
    queryFn: () => farmersApi.get(id as string),
    enabled: Boolean(id),
  });
}

/**
 * QR and barcode for an approved farmer.
 *
 * Only enabled once there is a farmerCode - without one the endpoint returns a
 * 400 telling us to approve the farmer first, which is a pointless round trip
 * when the list already told us the code is null.
 */
export function useFarmerCodes(id: string | undefined, hasCode: boolean) {
  return useQuery({
    queryKey: queryKeys.farmers.codes(id ?? ''),
    queryFn: () => farmersApi.codes(id as string),
    enabled: Boolean(id) && hasCode,
    staleTime: Infinity, // a farmer's codes never change once issued
  });
}

export function useCreateFarmer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFarmerInput) => farmersApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}

/**
 * FRD 5.1 - Super Admin only.
 *
 * Invalidates the whole farmers tree rather than just the row: approval changes
 * the status AND mints the traceability code, so every cached list that filtered
 * on status is now wrong too.
 */
export function useVerifyFarmer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VerifyFarmerInput }) =>
      farmersApi.verify(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}

export function useSetFarmerStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SettableFarmerStatus }) =>
      farmersApi.setStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}

export function useUpdateFarmer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFarmerInput }) =>
      farmersApi.update(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
      // The detail drawer holds agreements, visits and verification history
      // that the list does not, so refresh it by id rather than relying on the
      // list invalidation above.
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.detail(variables.id) });
    },
  });
}

/**
 * Only ever succeeds on an unapproved farmer with nothing recorded against
 * them. The server refuses anything else and says why - see `RowActions`, which
 * shows that reason verbatim.
 */
export function useDeleteFarmer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => farmersApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}

/**
 * FRD 7.6 performance for one farmer.
 *
 * Recomputed server-side on every read, so it cannot show a stale figure next
 * to the inspections that produced it.
 */
export function useFarmerPerformance(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farmers.performance(id ?? ''),
    queryFn: () => farmersApi.performance(id as string),
    enabled: Boolean(id),
  });
}

/**
 * What still blocks approval (FRD 7.1).
 *
 * Read by the verify modal so Approve can be disabled with the reasons shown,
 * rather than enabled and then refused.
 */
export function useFarmerReadiness(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farmers.readiness(id ?? ''),
    queryFn: () => farmersApi.readiness(id as string),
    enabled: Boolean(id),
  });
}

/** Backfill for farmers whose records predate scoring. */
export function useRecalculatePerformance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => farmersApi.recalculatePerformance(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}
