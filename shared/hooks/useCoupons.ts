import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { couponsApi } from '../api/coupons';
import type { CreateCouponInput } from '../api/types';

export const couponQueryKeys = {
  all: ['coupons'] as const,
  list: (includeInactive: boolean) => ['coupons', 'list', { includeInactive }] as const,
  detail: (id: string) => ['coupons', 'detail', id] as const,
};

export function useCoupons(includeInactive = true) {
  return useQuery({
    queryKey: couponQueryKeys.list(includeInactive),
    queryFn: () => couponsApi.list(includeInactive),
  });
}

export function useCreateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCouponInput) => couponsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: couponQueryKeys.all });
    },
  });
}

export function useUpdateCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<CreateCouponInput> }) =>
      couponsApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: couponQueryKeys.all });
    },
  });
}

export function useSetCouponActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      couponsApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: couponQueryKeys.all });
    },
  });
}

export function useDeleteCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => couponsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: couponQueryKeys.all });
    },
  });
}
