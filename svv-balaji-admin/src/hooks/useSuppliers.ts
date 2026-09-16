import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateSupplierDto,
  QuerySupplierDto,
  SupplierStatus,
  VerifySupplierDto,
  suppliersApi,
} from '../../../shared/api/suppliers';

const CACHE_KEY = ['suppliers'];

export function useSuppliers(query?: QuerySupplierDto) {
  return useQuery({
    queryKey: [...CACHE_KEY, query],
    queryFn: () => suppliersApi.list(query),
  });
}

export function useSupplier(id: string | null) {
  return useQuery({
    queryKey: [...CACHE_KEY, id],
    queryFn: () => (id ? suppliersApi.get(id) : null),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSupplierDto) => suppliersApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CACHE_KEY }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateSupplierDto> }) =>
      suppliersApi.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
    },
  });
}

export function useVerifySupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: VerifySupplierDto }) =>
      suppliersApi.verify(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
    },
  });
}

export function useSetSupplierStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupplierStatus }) =>
      suppliersApi.updateStatus(id, status),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: [...CACHE_KEY, id] });
    },
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => suppliersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CACHE_KEY }),
  });
}
