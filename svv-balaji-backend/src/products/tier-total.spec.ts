import { BadRequestException } from '@nestjs/common';
import { resolveTier } from './products.module';
import { tierDiscountPercent } from '../storefront/storefront-catalogue.service';

/**
 * A spice pack: MRP 699 per pack. The client enters each wholesale tier as the
 * TOTAL for that quantity of packs, and the order engine bills unitPrice x
 * quantity - so the total must become a per-pack price before it is stored.
 */
describe('total-for-quantity tiers', () => {
  it.each([
    [5, 2750, 550],
    [8, 4200, 525],
    [12, 6288, 524],
  ])('%i packs for %i is %i per pack, and keeps the typed total', (minQuantity, totalPrice, perPack) => {
    expect(resolveTier({ minQuantity, totalPrice })).toEqual({
      minQuantity,
      unitPrice: perPack,
      tierTotal: totalPrice,
    });
  });

  it('billing a tier quantity at the stored per-pack price gives back the entered total', () => {
    const t = resolveTier({ minQuantity: 8, totalPrice: 4200 });
    expect(t.unitPrice * 8).toBe(4200);
  });

  it('discount compares like with like: MRP (GST-inclusive) vs the per-pack price INCLUDING GST', () => {
    // 550 excl -> 577.50 incl vs MRP 699
    expect(tierDiscountPercent(699, 550, 5)).toBe(17.38);
    expect(tierDiscountPercent(699, 525, 5)).toBe(21.14); // 551.25 incl
    expect(tierDiscountPercent(699, 524, 5)).toBe(21.29); // 550.20 incl
  });

  it('does NOT compare the GST-inclusive MRP with the GST-exclusive price (that read 21.32%)', () => {
    expect(tierDiscountPercent(699, 550, 5)).not.toBe(21.32);
  });

  it('the old bug: the whole total treated as a per-pack price gives 0%', () => {
    expect(tierDiscountPercent(699, 2750, 5)).toBe(0);
  });

  it('with 0% GST the two bases coincide', () => {
    expect(tierDiscountPercent(699, 550, 0)).toBe(21.32);
  });

  it('has no discount to show without an MRP', () => {
    expect(tierDiscountPercent(null, 550, 5)).toBeNull();
  });

  it('leaves a per-unit tier exactly as entered', () => {
    expect(resolveTier({ minQuantity: 10, unitPrice: 384 })).toEqual({ minQuantity: 10, unitPrice: 384, tierTotal: null });
  });

  it('refuses a tier with both, or neither', () => {
    expect(() => resolveTier({ minQuantity: 5, unitPrice: 550, totalPrice: 2750 })).toThrow(BadRequestException);
    expect(() => resolveTier({ minQuantity: 5 })).toThrow(BadRequestException);
  });
});
