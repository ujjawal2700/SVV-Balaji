import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agreementsApi } from '../api/agreements';
import { queryKeys } from '../api/queryKeys';
import type {
  AgreementStatus,
  CreateAgreementInput,
  UpdateAgreementInput,
} from '../api/types';

export function useAgreements(farmerId?: string) {
  return useQuery({
    queryKey: queryKeys.agreements.list(farmerId),
    queryFn: () => agreementsApi.list(farmerId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateAgreement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAgreementInput) => agreementsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agreements.all });
      // The farmer profile drawer embeds this farmer's agreements, so its
      // cached copy is now stale too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}

export function useSetAgreementStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AgreementStatus }) =>
      agreementsApi.setStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agreements.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}

export function useUpdateAgreement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAgreementInput }) =>
      agreementsApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agreements.all });
    },
  });
}

export function useDeleteAgreement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => agreementsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agreements.all });
      // The collection form shows the agreed rate as a fallback hint, so a
      // removed agreement has to leave that picker too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
    },
  });
}
