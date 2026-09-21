import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkoutAdminApi, type ServerCouponInput, type UpdateCheckoutSettingsInput } from '../api/checkout';
import { queryKeys } from '../api/queryKeys';

export function useCheckoutSettings() {
  return useQuery({ queryKey: ['checkout-settings'], queryFn: () => checkoutAdminApi.settings() });
}

export function useUpdateCheckoutSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCheckoutSettingsInput) => checkoutAdminApi.updateSettings(input),
    onSuccess: (s) => qc.setQueryData(['checkout-settings'], s),
  });
}

export function useServerCoupons() {
  return useQuery({ queryKey: ['server-coupons'], queryFn: () => checkoutAdminApi.coupons() });
}

export function useSaveCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ServerCouponInput }) =>
      id ? checkoutAdminApi.updateCoupon(id, input) : checkoutAdminApi.createCoupon(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['server-coupons'] }),
  });
}

export function usePickPlan(orderId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['pick-plan', orderId],
    queryFn: () => checkoutAdminApi.pickPlan(orderId as string),
    enabled: Boolean(orderId) && enabled,
  });
}

/** Every fulfilment action changes the order, its plan and the loyalty ledger: refresh all of them. */
export function useFulfillmentAction<TVars>(fn: (v: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      void qc.invalidateQueries({ queryKey: ['pick-plan'] });
      void qc.invalidateQueries({ queryKey: queryKeys.loyalty.all });
    },
  });
}
