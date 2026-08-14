import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { packagingApi } from '../api/packaging';
import { queryKeys } from '../api/queryKeys';
import type { CreateFinishedGoodsBatchInput, StockFinishedGoodsInput } from '../api/types';

export function useFinishedGoods(filters: {
  productionBatchId?: string;
  qaReleased?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.finishedGoods.list(filters),
    queryFn: () => packagingApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useProductLabel(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.finishedGoods.label(id ?? ''),
    queryFn: () => packagingApi.label(id as string),
    enabled: Boolean(id),
    // A pack's label never changes once the batch is made.
    staleTime: Infinity,
  });
}

export function useFinishedGoodsStock(warehouseId?: string) {
  return useQuery({
    queryKey: queryKeys.finishedGoods.stock(warehouseId),
    queryFn: () => packagingApi.stock(warehouseId),
    placeholderData: keepPreviousData,
  });
}

export function useCreateFinishedGoods() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateFinishedGoodsBatchInput) => packagingApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.finishedGoods.all });
      // The production batch now lists this pack batch and has less unpacked
      // output remaining.
      void queryClient.invalidateQueries({ queryKey: queryKeys.productionBatches.all });
    },
  });
}

export function useStockFinishedGoods() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StockFinishedGoodsInput }) =>
      packagingApi.stockIn(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.finishedGoods.all });
    },
  });
}
