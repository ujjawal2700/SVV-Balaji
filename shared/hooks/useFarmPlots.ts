import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { farmPlotsApi, type FarmPlotInput } from '../api/farmPlots';
import { queryKeys } from '../api/queryKeys';

export function useFarmPlots(farmerId: string | undefined, includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.farmPlots.list(farmerId ?? '', includeInactive),
    queryFn: () => farmPlotsApi.list(farmerId as string, includeInactive),
    enabled: Boolean(farmerId),
  });
}

export function useFarmPlotSummary(farmerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farmPlots.summary(farmerId ?? ''),
    queryFn: () => farmPlotsApi.summary(farmerId as string),
    enabled: Boolean(farmerId),
  });
}

/**
 * All three mutations invalidate the farmer tree as well as the plot tree.
 * The farmer list card shows plot count and mapped area, so a plot added on
 * the detail screen has to change the row behind it too.
 */
function useInvalidatePlots(farmerId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.farmPlots.all(farmerId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.farmers.all });
  };
}

export function useCreateFarmPlot(farmerId: string) {
  const invalidate = useInvalidatePlots(farmerId);
  return useMutation({
    mutationFn: (input: FarmPlotInput) => farmPlotsApi.create(farmerId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateFarmPlot(farmerId: string) {
  const invalidate = useInvalidatePlots(farmerId);
  return useMutation({
    mutationFn: ({ plotId, input }: { plotId: string; input: FarmPlotInput }) =>
      farmPlotsApi.update(farmerId, plotId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteFarmPlot(farmerId: string) {
  const invalidate = useInvalidatePlots(farmerId);
  return useMutation({
    mutationFn: (plotId: string) => farmPlotsApi.remove(farmerId, plotId),
    onSuccess: invalidate,
  });
}
