/**
 * The storefront's destinations, in one place.
 *
 * The header and the mobile drawer render from this list, so a route added in
 * App.tsx and not added here is simply unreachable rather than half-linked.
 */
export interface StoreNavItem {
  path: string;
  label: string;
  /** Hidden from the nav until somebody is signed in. */
  requiresAccount?: boolean;
  /** FRD section this destination implements — kept for traceability. */
  frd: string;
}

export const STORE_NAV: StoreNavItem[] = [
  { path: '/products', label: 'Shop', frd: '29.1' },
  { path: '/orders', label: 'My orders', requiresAccount: true, frd: '29.3' },
  { path: '/trace', label: 'Trace a pack', frd: '30' },
];

/**
 * Not in the nav, on purpose.
 *
 *   /cart, /checkout          reached from the cart button and the cart page
 *   /products/:id             reached from the grid
 *   /orders/:id               reached from the orders list
 *   /trace/:fgBatchNumber     reached from a QR code on a pack, usually with no
 *                             prior visit to any other page
 *   /login, /register         reached from the account button
 */
