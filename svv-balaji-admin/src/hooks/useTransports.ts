import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateTransportDto,
  QueryTransportDto,
  transportsApi,
} from '../../../shared/api/transports';

const CACHE_KEY = ['transports'];

export function useTransports(query?: QueryTransportDto) {
  return useQuery({
    queryKey: [...CACHE_KEY, query],
    queryFn: () => transportsApi.list(query),
  });
}

export function useTransport(id: string | null) {
  return useQuery({
    queryKey: [...CACHE_KEY, id],
    queryFn: () => (id ? transportsApi.get(id) : null),
    enabled: !!id,
  });
}

export function useCreateTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTransportDto) => transportsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
    },
  });
}

export function useUpdateTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTransportDto> }) =>
      transportsApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
    },
  });
}

export function useDispatchTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transportsApi.dispatch(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
    },
  });
}

export function useDeliverTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, warehouseId }: { id: string; warehouseId: string }) =>
      transportsApi.deliver(id, warehouseId),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
  });
}

export function useCancelTransport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, remarks }: { id: string; remarks?: string }) =>
      transportsApi.cancel(id, remarks),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
    },
  });
}
