import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderStatus,
  QueryPurchaseOrderDto,
  purchaseOrdersApi,
} from '../../../shared/api/purchaseOrders';

const CACHE_KEY = ['purchaseOrders'];

export function usePurchaseOrders(query?: QueryPurchaseOrderDto) {
  return useQuery({
    queryKey: [...CACHE_KEY, query],
    queryFn: () => purchaseOrdersApi.list(query),
  });
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: [...CACHE_KEY, id],
    queryFn: () => (id ? purchaseOrdersApi.get(id) : null),
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePurchaseOrderDto) => purchaseOrdersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePurchaseOrderDto> }) =>
      purchaseOrdersApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
    },
  });
}

export function useSetPurchaseOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PurchaseOrderStatus }) =>
      purchaseOrdersApi.updateStatus(id, status),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
    },
  });
}
