import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { seedDistributionApi } from '../api/seedDistribution';
import type {
  CreateSeedDistributionInput,
  UpdateSeedDistributionInput,
} from '../api/types';

export function useSeedDistribution(
  filters: { farmerId?: string; distributedById?: string } = {},
) {
  return useQuery({
    queryKey: queryKeys.seedDistribution.list(filters),
    queryFn: () => seedDistributionApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCreateSeedDistribution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSeedDistributionInput) => seedDistributionApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.seedDistribution.all });
      // Also shown on the farmer profile.
      void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
    },
  });
}

export function useUpdateSeedDistribution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSeedDistributionInput }) =>
      seedDistributionApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.seedDistribution.all });
    },
  });
}

export function useDeleteSeedDistribution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => seedDistributionApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.seedDistribution.all });
    },
  });
}
