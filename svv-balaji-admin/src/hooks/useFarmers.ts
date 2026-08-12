import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { farmersApi } from '../api/farmers';
import { queryKeys } from '../api/queryKeys';
import type {
  CreateFarmerInput,
  FarmerQuery,
  SettableFarmerStatus,
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
