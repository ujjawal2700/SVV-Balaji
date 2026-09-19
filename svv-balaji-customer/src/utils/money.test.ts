import { describe, expect, it } from 'vitest';
import { formatInr } from './money';

describe('formatInr', () => {
  it.each([
    [6602.4, '₹6,602.40'],
    [3465, '₹3,465.00'],
    [550.2, '₹550.20'],
    [577.5, '₹577.50'],
    [0, '₹0.00'],
    [180, '₹180.00'],
  ])('%s -> %s', (value, expected) => {
    expect(formatInr(value)).toBe(expected);
  });

  it('uses Indian digit grouping (lakhs)', () => {
    expect(formatInr(1234567.5)).toBe('₹12,34,567.50');
  });

  it('rounds to paise rather than showing float noise', () => {
    expect(formatInr(0.1 + 0.2)).toBe('₹0.30');
    expect(formatInr(6602.400000000001)).toBe('₹6,602.40');
  });
});
