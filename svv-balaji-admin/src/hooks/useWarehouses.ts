import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import type {
  AdjustStockInput,
  CreateWarehouseInput,
  StockInInput,
  StockOutInput,
  TransferStockInput,
  UpdateWarehouseInput,
} from '../api/types';
import { warehousesApi } from '../api/warehouses';

export function useWarehouses(branchId?: string, includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.warehouses.list(branchId, includeInactive),
    queryFn: () => warehousesApi.list(branchId, includeInactive),
    // Master data, read by pickers across several screens.
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWarehouseInput }) =>
      warehousesApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
    },
  });
}

export function useSetWarehouseActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      warehousesApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
    },
  });
}

export function useDeleteWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehousesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
    },
  });
}

export function useWarehouseStatus(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.warehouses.status(id ?? ''),
    queryFn: () => warehousesApi.status(id as string),
    enabled: Boolean(id),
  });
}

export function useWarehouseStock(filters: { warehouseId?: string; batchId?: string }) {
  return useQuery({
    queryKey: queryKeys.warehouses.stock(filters),
    queryFn: () => warehousesApi.stock(filters),
    placeholderData: keepPreviousData,
  });
}

export function useLowStock(threshold: number, warehouseId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.warehouses.lowStock(threshold, warehouseId),
    queryFn: () => warehousesApi.lowStock(threshold, warehouseId),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useStockMovements(filters: { batchId?: string; warehouseId?: string }) {
  return useQuery({
    queryKey: queryKeys.warehouses.movements(filters),
    queryFn: () => warehousesApi.movements(filters),
    placeholderData: keepPreviousData,
  });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateWarehouseInput) => warehousesApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
    },
  });
}

/**
 * Every stock mutation moves three things at once — the balance, the ledger and
 * the warehouse's occupancy — plus the batch's own status and location. So all
 * of them invalidate the warehouse tree and the batch tree, rather than trying
 * to be surgical and getting it subtly wrong.
 */
function useStockMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    },
  });
}

export function useStockIn() {
  return useStockMutation<{ warehouseId: string; input: StockInInput }>(({ warehouseId, input }) =>
    warehousesApi.stockIn(warehouseId, input),
  );
}

export function useStockOut() {
  return useStockMutation<{ warehouseId: string; input: StockOutInput }>(({ warehouseId, input }) =>
    warehousesApi.stockOut(warehouseId, input),
  );
}

export function useAdjustStock() {
  return useStockMutation<{ warehouseId: string; input: AdjustStockInput }>(
    ({ warehouseId, input }) => warehousesApi.adjust(warehouseId, input),
  );
}

export function useTransferStock() {
  return useStockMutation<TransferStockInput>((input) => warehousesApi.transfer(input));
}
