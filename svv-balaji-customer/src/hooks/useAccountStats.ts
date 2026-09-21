import { useQuery } from '@tanstack/react-query';
import { checkoutApi } from '../api/checkout';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

/**
 * The counters shown on the profile page and account menu, read from the
 * account's own orders / addresses / coupons - never from local defaults.
 */
export function useAccountStats() {
  const { isLoggedIn } = useCustomerAuth();
  const opts = { enabled: isLoggedIn, retry: false, staleTime: 30_000 } as const;
  const orders = useQuery({ queryKey: ['storefront', 'orders'], queryFn: checkoutApi.orders, ...opts });
  const addresses = useQuery({ queryKey: ['storefront', 'addresses'], queryFn: checkoutApi.addresses, ...opts });
  const coupons = useQuery({ queryKey: ['storefront', 'coupons'], queryFn: checkoutApi.coupons, ...opts });
  return {
    orderCount: orders.data?.length ?? 0,
    addressCount: addresses.data?.length ?? 0,
    couponCount: coupons.data?.length ?? 0,
    orders: orders.data ?? [],
    loading: orders.isLoading || addresses.isLoading || coupons.isLoading,
  };
}
