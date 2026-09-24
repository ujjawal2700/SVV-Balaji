import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { walletApi } from '../api/wallet';
import { queryKeys } from '../api/queryKeys';
import type { UpdateWalletSettingsInput } from '../api/types';

export function useWalletSettings() {
  return useQuery({
    queryKey: queryKeys.walletSettings.all,
    queryFn: () => walletApi.getSettings(),
  });
}

export function useUpdateWalletSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateWalletSettingsInput) => walletApi.updateSettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.walletSettings.all, settings);
    },
  });
}

export function useCustomerWalletBalance(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.walletBalance.customer(customerId ?? ''),
    queryFn: () => walletApi.customerBalance(customerId as string),
    enabled: !!customerId,
  });
}
