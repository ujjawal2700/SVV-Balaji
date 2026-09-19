const INR = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Rupees for any price or total the shopper reads - always two decimals, with
 * Indian digit grouping: 6602.4 -> "₹6,602.40", 3465 -> "₹3,465.00".
 *
 * One formatter for the whole app. Ten pages used to carry their own copy that
 * dropped trailing zeros, so the same total could read "₹6,602.4" on one screen
 * and "₹6,602.40" on another.
 */
export function formatInr(value: number): string {
  return `₹${INR.format(value)}`;
}
