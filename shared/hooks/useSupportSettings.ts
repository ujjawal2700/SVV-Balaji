import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportSettingsApi } from '../api/supportSettings';
import { queryKeys } from '../api/queryKeys';
import type { UpdateSupportSettingsInput } from '../api/types';

export function useSupportSettings() {
  return useQuery({
    queryKey: queryKeys.supportSettings.all,
    queryFn: () => supportSettingsApi.get(),
  });
}

export function useStorefrontSupport(channel?: string) {
  return useQuery({
    queryKey: queryKeys.supportSettings.storefront(channel),
    queryFn: () => supportSettingsApi.getStorefront(channel),
    staleTime: 60_000,
  });
}

export function useUpdateSupportSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSupportSettingsInput) => supportSettingsApi.update(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.supportSettings.all, settings);
      queryClient.invalidateQueries({ queryKey: ['support-settings'] });
    },
  });
}
