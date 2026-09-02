import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CartApi, CartLine } from './types';

/**
 * Where the cart lives, and why it lives there.
 *
 * In the browser, until checkout. A shopper adding a bag of millet does not
 * create a row on the server, and an abandoned cart leaves nothing behind to
 * clean up. The alternative — a server-side cart — buys "resume on another
 * device", which needs an account before you can shop, which is the single
 * biggest thing that stops people shopping. If the client later asks for
 * cross-device carts, this module is the only place that changes.
 *
 * It sits ABOVE AuthProvider in main.tsx so that signing in mid-checkout keeps
 * the cart. Nothing in here reads the session.
 */

const CART_STORAGE_KEY = import.meta.env.VITE_CART_KEY ?? 'svv.customer.cart';

/**
 * Bump when the shape of a stored line changes.
 *
 * A stale cart from an older deploy is discarded rather than migrated. It is a
 * shopping list, not a record — losing one costs a shopper thirty seconds,
 * whereas half-parsing one into a checkout is how somebody is charged for a
 * product that no longer exists.
 */
const CART_VERSION = 1;

interface StoredCart {
  version: number;
  lines: CartLine[];
}

function readStoredCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCart;
    if (parsed?.version !== CART_VERSION || !Array.isArray(parsed.lines)) return [];
    return parsed.lines.filter((line) => line && line.productId && line.quantity > 0);
  } catch {
    // Private browsing can throw on storage; malformed JSON can throw on parse.
    // Either way an empty cart is the correct recovery.
    return [];
  }
}

export const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readStoredCart);

  useEffect(() => {
    try {
      const payload: StoredCart = { version: CART_VERSION, lines };
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* see readStoredCart — a cart that cannot persist still works this visit */
    }
  }, [lines]);

  const add = useCallback((line: Omit<CartLine, 'quantity'>, quantity = 1) => {
    if (quantity <= 0) return;
    setLines((current) => {
      const existing = current.find((l) => l.productId === line.productId);
      if (!existing) return [...current, { ...line, quantity }];
      // Adding the same product again tops up rather than duplicating the row,
      // which is what every shopper expects and what the checkout assumes.
      return current.map((l) =>
        l.productId === line.productId ? { ...l, ...line, quantity: l.quantity + quantity } : l,
      );
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.productId !== productId)
        : current.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((current) => current.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartApi>(() => {
    const count = lines.reduce((sum, l) => sum + l.quantity, 0);
    const priced = lines.every((l) => typeof l.displayUnitPrice === 'number');
    const indicativeTotal = priced
      ? lines.reduce((sum, l) => sum + (l.displayUnitPrice as number) * l.quantity, 0)
      : null;

    return { lines, add, setQuantity, remove, clear, count, indicativeTotal };
  }, [lines, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
