import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { seedDistributionApi } from '../api/seedDistribution';
import type { CreateSeedDistributionInput } from '../api/types';

export function useSeedDistribution(farmerId?: string) {
  return useQuery({
    queryKey: queryKeys.seedDistribution.list(farmerId),
    queryFn: () => seedDistributionApi.list(farmerId),
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
