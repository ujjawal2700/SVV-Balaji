import type { PaymentStatus } from '../api/types';

/**
 * How a payment status is rendered, in one place.
 *
 * There were three of these maps — the orders list, the order drawer and the
 * collections page — each `Record<PaymentStatus, string>` and each with its own
 * colour choices. When FRD 26.4's FAILED and REFUNDED were added, all three
 * broke at once, which is the useful version of the problem: the compiler
 * caught it. The unuseful version is three maps drifting apart silently
 * because one was updated and the others were not.
 *
 * Note the deliberate asymmetry with the collections page's old palette: it
 * used red for PENDING, the orders screens used gold. Red is now reserved for
 * FAILED, because a farmer who has not been paid yet and a payment that
 * actually bounced are different problems and should not look the same.
 */
export const PAYMENT_STATUS_COLOUR: Record<PaymentStatus, string> = {
  PENDING: 'gold',
  PARTIAL: 'orange',
  PAID: 'green',
  /** Someone tried and it bounced — the one that needs chasing today. */
  FAILED: 'red',
  /** Terminal. Money went back; nothing is owed and nothing is expected. */
  REFUNDED: 'purple',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  PARTIAL: 'Partial',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};

/**
 * Statuses a user may move a record to by hand.
 *
 * REFUNDED is absent on purpose: a refund is a money movement, not a label, and
 * until there is a payment record to attach it to (FRD 26.2, not built) letting
 * someone tick "refunded" would assert something the system cannot evidence.
 */
export const SETTABLE_PAYMENT_STATUSES: PaymentStatus[] = [
  'PENDING',
  'PARTIAL',
  'PAID',
  'FAILED',
];
