import { useContext } from 'react';
import { CartContext } from './CartProvider';
import type { CartApi } from './types';

/**
 * Throws rather than returning an empty cart when the provider is missing.
 *
 * A silent empty cart looks exactly like a cart the shopper emptied, and the
 * bug would surface as "items disappear sometimes" weeks later.
 */
export function useCart(): CartApi {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart must be used inside <CartProvider>');
  return cart;
}
