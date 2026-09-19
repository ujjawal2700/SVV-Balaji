import type { CartLine, CartPriceTier } from './types';

/**
 * The tier a quantity falls into: the highest quantity break at or below it.
 * Below the first break (a cart stepper can go under the MOQ) the first tier's
 * price applies - the same rule the product page uses, so the two never differ.
 * Same precedence as the server's PricingService.resolve: highest qualifying break.
 */
export function unitPriceForQuantity(tiers: CartPriceTier[] | null | undefined, quantity: number): number | null {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  const qualifying = sorted.filter((t) => quantity >= t.minQuantity);
  return (qualifying.length > 0 ? qualifying[qualifying.length - 1] : sorted[0]).unitPrice;
}

/**
 * A line's price follows its FINAL quantity, not the quantity of whichever
 * action last touched it. Lines with no ladder (consumer lines, single-price
 * items) keep the price they were added with.
 */
export function repriced(line: CartLine): CartLine {
  const price = unitPriceForQuantity(line.priceTiers, line.quantity);
  return price === null ? line : { ...line, displayUnitPrice: price };
}

/**
 * Adding a product that is already in the cart tops the line up and re-prices
 * the WHOLE line for the combined quantity. Adding 6 then 6 more is a 12-pack
 * line at the 12+ rate, not a 12-pack line at the rate the second add qualified for.
 */
export function addToLines(current: CartLine[], line: Omit<CartLine, 'quantity'>, quantity: number): CartLine[] {
  if (quantity <= 0) return current;
  const existing = current.find((l) => l.productId === line.productId);
  if (!existing) return [...current, repriced({ ...line, quantity })];
  return current.map((l) =>
    // `line` wins for display fields and the ladder (they may have changed since
    // the first add), but the quantity is always the combined total.
    l.productId === line.productId ? repriced({ ...l, ...line, quantity: l.quantity + quantity }) : l,
  );
}

/** Setting a quantity (cart stepper, checkout) re-prices the line the same way an add does. */
export function setLineQuantity(current: CartLine[], productId: string, quantity: number): CartLine[] {
  if (quantity <= 0) return current.filter((l) => l.productId !== productId);
  return current.map((l) => (l.productId === productId ? repriced({ ...l, quantity }) : l));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sum of price x quantity, rounded once - float noise (6602.400000000001) must not reach the screen. */
export function linesTotal(lines: CartLine[]): number | null {
  if (!lines.every((l) => typeof l.displayUnitPrice === 'number')) return null;
  return round2(lines.reduce((sum, l) => sum + (l.displayUnitPrice as number) * l.quantity, 0));
}
