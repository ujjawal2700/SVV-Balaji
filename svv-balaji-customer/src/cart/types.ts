/**
 * What a shopper has picked, before any of it is an order.
 *
 * Deliberately NOT the `OrderItem` shape from `@shared/api/types`. An order item
 * is a committed row on the server with a frozen price and an allocation against
 * a finished-goods batch; a cart line is a browser-side intention that may never
 * become one. Reusing the server type here would invite code that treats them as
 * interchangeable, and the first bug from that is a price the customer chose.
 */
export interface CartLine {
  /** Finished product, not a batch. The batch is chosen by allocation at checkout. */
  productId: string;

  /** Copied for display so the cart renders with no extra request. Not authoritative. */
  productName: string;
  unit: string;
  packSize?: string | null;
  imageUrl?: string | null;
  mrp?: number | null;

  quantity: number;

  /**
   * The price shown when the line was added, for display only.
   *
   * The server re-prices every line at checkout and the order is created from
   * ITS number, never this one. A cart can sit in a browser for a week; a client
   * -held price that is trusted is a discount anyone can grant themselves with
   * dev tools. If the two differ at checkout the customer is told before paying.
   */
  displayUnitPrice: number | null;
}

export interface CartState {
  lines: CartLine[];
  deliveryPincode?: string | null;
  deliveryInfo?: { mode: 'QUICK' | 'STANDARD', eta: string, charge: number } | null;
}

export interface CartApi extends CartState {
  add(line: Omit<CartLine, 'quantity'>, quantity?: number): void;
  setQuantity(productId: string, quantity: number): void;
  remove(productId: string): void;
  clear(): void;
  setDelivery(pincode: string | null, info: { mode: 'QUICK' | 'STANDARD', eta: string, charge: number } | null): void;

  /** Total units, for the header badge. */
  count: number;

  /**
   * Indicative total from `displayUnitPrice`, or null if any line has no price.
   * Labelled as indicative wherever it is shown — see the note on the field.
   */
  indicativeTotal: number | null;
}
