import { Placeholder } from './Placeholder';

/**
 * The cart — first half of FRD 29.2.
 *
 * Lines, quantities, removal and an indicative total. The cart itself already
 * exists and works; see `src/cart/CartProvider.tsx`. This screen is the view of
 * it. Nothing here talks to the server — the cart is a browser-side shopping
 * list until checkout, deliberately.
 */
export function CartPage() {
  return (
    <Placeholder
      frd="29.2"
      title="Your cart"
      summary="Lines, quantities and an indicative total, reading from the cart in cart/CartProvider.tsx."
    />
  );
}
