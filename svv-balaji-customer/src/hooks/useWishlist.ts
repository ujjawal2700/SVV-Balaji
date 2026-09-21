import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { wishlistApi } from '../api/wishlist';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

export const WISHLIST_KEY = ['storefront', 'wishlist'] as const;

/** The signed-in customer's saved product ids. Empty (and never fetched) for guests. */
export function useWishlist() {
  const { isLoggedIn } = useCustomerAuth();
  const query = useQuery({ queryKey: WISHLIST_KEY, queryFn: wishlistApi.list, enabled: isLoggedIn, retry: false });
  const ids = new Set((query.data ?? []).map((e) => e.productId));
  return { ...query, ids, has: (productId: string) => ids.has(productId) };
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, saved }: { productId: string; saved: boolean }) =>
      saved ? wishlistApi.remove(productId) : wishlistApi.add(productId),
    onSuccess: () => qc.invalidateQueries({ queryKey: WISHLIST_KEY }),
  });
}
