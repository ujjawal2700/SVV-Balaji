import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { referralSettingsApi } from '../api/referralSettings';
import { queryKeys } from '../api/queryKeys';
import type { UpdateReferralSettingsInput } from '../api/types';

export function useReferralSettings() {
  return useQuery({
    queryKey: queryKeys.referralSettings.all,
    queryFn: () => referralSettingsApi.get(),
  });
}

export function useUpdateReferralSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateReferralSettingsInput) => referralSettingsApi.update(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.referralSettings.all, settings);
    },
  });
}
