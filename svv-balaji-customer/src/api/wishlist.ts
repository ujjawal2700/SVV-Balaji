import { api } from './client';

export interface WishlistEntry {
  productId: string;
  createdAt: string;
}

export const wishlistApi = {
  list: () => api.get<WishlistEntry[]>('/storefront/wishlist').then((r) => r.data),
  add: (productId: string) => api.put(`/storefront/wishlist/${encodeURIComponent(productId)}`).then((r) => r.data),
  remove: (productId: string) => api.delete(`/storefront/wishlist/${encodeURIComponent(productId)}`).then((r) => r.data),
};
