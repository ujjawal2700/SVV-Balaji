import { describe, expect, it } from 'vitest';
import { addToLines, linesTotal, repriced, setLineQuantity, unitPriceForQuantity } from './cartLines';
import type { CartLine } from './types';

/**
 * The Premium Whole Spices Combo, as a retailer sees it. Tiers are entered as
 * totals per quantity (5 packs = 2750 etc.); these are the per-pack prices
 * INCLUDING 5% GST that the storefront hands the cart:
 *
 *   5-7 packs   577.50
 *   8-11 packs  551.25
 *   12+ packs   550.20
 */
const TIERS = [
  { minQuantity: 5, unitPrice: 577.5 },
  { minQuantity: 8, unitPrice: 551.25 },
  { minQuantity: 12, unitPrice: 550.2 },
];

const spice = (): Omit<CartLine, 'quantity'> => ({
  productId: 'spice-combo',
  productName: 'Premium Whole Spices Combo',
  unit: 'pack',
  // What the product page quotes for THIS add - deliberately the rate of the
  // quantity being added, not of the combined cart, to prove the cart overrides it.
  displayUnitPrice: 577.5,
  priceTiers: TIERS,
  mrp: 699,
});

const line = (lines: CartLine[]) => lines.find((l) => l.productId === 'spice-combo')!;

/** Runs a sequence of separate "Add" actions, as a shopper clicking the button repeatedly. */
const addAll = (...quantities: number[]) =>
  quantities.reduce<CartLine[]>((cart, q) => addToLines(cart, spice(), q), []);

describe('unitPriceForQuantity', () => {
  it('picks the highest break at or below the quantity', () => {
    expect(unitPriceForQuantity(TIERS, 5)).toBe(577.5);
    expect(unitPriceForQuantity(TIERS, 7)).toBe(577.5);
    expect(unitPriceForQuantity(TIERS, 8)).toBe(551.25);
    expect(unitPriceForQuantity(TIERS, 11)).toBe(551.25);
    expect(unitPriceForQuantity(TIERS, 12)).toBe(550.2);
    expect(unitPriceForQuantity(TIERS, 500)).toBe(550.2);
  });

  it('uses the first tier below the first break (a stepper can go under the MOQ)', () => {
    expect(unitPriceForQuantity(TIERS, 4)).toBe(577.5);
    expect(unitPriceForQuantity(TIERS, 1)).toBe(577.5);
  });

  it('does not depend on the order the tiers arrive in', () => {
    expect(unitPriceForQuantity([...TIERS].reverse(), 9)).toBe(551.25);
  });

  it('has no opinion without a ladder', () => {
    expect(unitPriceForQuantity(null, 6)).toBeNull();
    expect(unitPriceForQuantity([], 6)).toBeNull();
  });
});

describe('the requested transitions, via separate Add actions', () => {
  it('4 -> 5: crossing into the first tier', () => {
    const cart = addAll(4, 1);
    expect(line(cart).quantity).toBe(5);
    expect(line(cart).displayUnitPrice).toBe(577.5);
    expect(linesTotal(cart)).toBe(2887.5);
  });

  it('6 -> 8: adding 2 to 6 moves the WHOLE line to the 8-11 tier', () => {
    const cart = addAll(6, 2);
    expect(line(cart).quantity).toBe(8);
    expect(line(cart).displayUnitPrice).toBe(551.25);
    expect(linesTotal(cart)).toBe(4410); // 8 x 551.25
  });

  it('7 -> 8: a single extra pack tips the whole line over the break', () => {
    const cart = addAll(7, 1);
    expect(line(cart).displayUnitPrice).toBe(551.25);
    expect(linesTotal(cart)).toBe(4410);
    // ...and 7 on its own was still the first tier.
    expect(line(addAll(7)).displayUnitPrice).toBe(577.5);
  });

  it('11 -> 12: a single extra pack tips the whole line into the 12+ tier', () => {
    const cart = addAll(11, 1);
    expect(line(cart).quantity).toBe(12);
    expect(line(cart).displayUnitPrice).toBe(550.2);
    expect(linesTotal(cart)).toBe(6602.4);
    expect(line(addAll(11)).displayUnitPrice).toBe(551.25);
  });

  it('6 + 6 = 12 packs at the 12+ rate: 12 x 550.20 = 6602.40, not 12 x 577.50', () => {
    const cart = addAll(6, 6);
    expect(line(cart).quantity).toBe(12);
    expect(line(cart).displayUnitPrice).toBe(550.2);
    expect(linesTotal(cart)).toBe(6602.4);
  });

  it('many small adds walk through every tier and always price by the running total', () => {
    let cart: CartLine[] = [];
    const seen: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) {
      cart = addToLines(cart, spice(), 1);
      seen.push([line(cart).quantity, line(cart).displayUnitPrice as number]);
    }
    const priceAt = (q: number) => seen.find(([qty]) => qty === q)![1];
    expect(priceAt(4)).toBe(577.5); // below MOQ: first tier
    expect(priceAt(5)).toBe(577.5);
    expect(priceAt(7)).toBe(577.5);
    expect(priceAt(8)).toBe(551.25);
    expect(priceAt(11)).toBe(551.25);
    expect(priceAt(12)).toBe(550.2);
  });
});

describe('quantity changes that are not an Add', () => {
  it('the cart-page stepper re-prices too (7 -> 8 -> 7 -> 12)', () => {
    let cart = addAll(7);
    cart = setLineQuantity(cart, 'spice-combo', 8);
    expect(line(cart).displayUnitPrice).toBe(551.25);
    cart = setLineQuantity(cart, 'spice-combo', 7);
    expect(line(cart).displayUnitPrice).toBe(577.5); // and back DOWN
    cart = setLineQuantity(cart, 'spice-combo', 12);
    expect(line(cart).displayUnitPrice).toBe(550.2);
  });

  it('setting the quantity to 0 removes the line', () => {
    expect(setLineQuantity(addAll(6), 'spice-combo', 0)).toEqual([]);
  });

  it('an old stored line quoting the pre-repricing rate is corrected on load', () => {
    const stale: CartLine = { ...spice(), quantity: 12, displayUnitPrice: 2887.5 };
    expect(repriced(stale).displayUnitPrice).toBe(550.2);
  });
});

describe('what must not change', () => {
  it('a line with no ladder (consumer, single price) keeps its price whatever the quantity', () => {
    const consumer = { ...spice(), priceTiers: null, displayUnitPrice: 558 };
    let cart = addToLines([], consumer, 2);
    cart = addToLines(cart, consumer, 20);
    expect(line(cart).quantity).toBe(22);
    expect(line(cart).displayUnitPrice).toBe(558);
  });

  it('two different products are priced independently', () => {
    const other: Omit<CartLine, 'quantity'> = {
      productId: 'atta',
      productName: 'Atta',
      unit: 'pack',
      displayUnitPrice: 100,
      priceTiers: [{ minQuantity: 1, unitPrice: 100 }, { minQuantity: 10, unitPrice: 90 }],
    };
    let cart = addToLines([], spice(), 12);
    cart = addToLines(cart, other, 3);
    expect(cart.find((l) => l.productId === 'atta')!.displayUnitPrice).toBe(100);
    expect(line(cart).displayUnitPrice).toBe(550.2);
    // 12 x 550.20 + 3 x 100
    expect(linesTotal(cart)).toBe(6902.4);
  });

  it('the total carries no float noise', () => {
    expect(String(linesTotal(addAll(12)))).toBe('6602.4');
  });

  it('the cart total is the same figure checkout reads: sum of displayUnitPrice x quantity', () => {
    const cart = addAll(6, 6);
    const checkoutStyleTotal = cart.reduce((sum, l) => sum + (l.displayUnitPrice as number) * l.quantity, 0);
    expect(linesTotal(cart)).toBeCloseTo(checkoutStyleTotal, 2);
  });
});
