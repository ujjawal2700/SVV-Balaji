import { describe, expect, it } from 'vitest';
import { buildAffiliateLink } from './affiliateLink';

const ORIGIN = 'https://svvbalaji.com';

describe('buildAffiliateLink', () => {
  it('shares the home page when nothing is pasted', () => {
    expect(buildAffiliateLink('', 'RAUNAK7K2Q', ORIGIN)).toBe('https://svvbalaji.com/?aff=RAUNAK7K2Q');
  });

  it('keeps the page and its other parameters', () => {
    expect(buildAffiliateLink('https://svvbalaji.com/products/masala?sort=new', 'ABC', ORIGIN)).toBe('https://svvbalaji.com/products/masala?sort=new&aff=ABC');
    expect(buildAffiliateLink('/product-detail/42', 'ABC', ORIGIN)).toBe('https://svvbalaji.com/product-detail/42?aff=ABC');
  });

  it('replaces someone else\'s code rather than adding a second one', () => {
    expect(buildAffiliateLink('/?aff=OTHER', 'MINE', ORIGIN)).toBe('https://svvbalaji.com/?aff=MINE');
  });

  it('refuses links to other sites', () => {
    expect(buildAffiliateLink('https://example.com/x', 'ABC', ORIGIN)).toBeNull();
  });
});
