import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { yieldTrackingApi } from '../api/yieldTracking';
import { queryKeys } from '../api/queryKeys';
import type { YieldChainQuery } from '../api/types';

export function useYieldChains(filters: YieldChainQuery) {
  return useQuery({
    queryKey: queryKeys.yieldTracking.list(filters as Record<string, unknown>),
    queryFn: () => yieldTrackingApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useYieldChainDetail(args: { productionBatchId?: string; fgBatchNumber?: string }) {
  return useQuery({
    queryKey: queryKeys.yieldTracking.chain(args),
    queryFn: () => yieldTrackingApi.chain(args),
    enabled: Boolean(args.productionBatchId || args.fgBatchNumber),
  });
}

export function useFarmerYieldQuality() {
  return useQuery({
    queryKey: queryKeys.yieldTracking.farmerQuality(),
    queryFn: () => yieldTrackingApi.farmerQuality(),
  });
}

export function useMachineYieldHealth() {
  return useQuery({
    queryKey: queryKeys.yieldTracking.machineHealth(),
    queryFn: () => yieldTrackingApi.machineHealth(),
  });
}
