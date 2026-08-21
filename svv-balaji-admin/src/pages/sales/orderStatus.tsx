import type { Permission } from '@shared/auth/permissions';
import type { OrderStatus } from '@shared/api/types';

export const ORDER_STATUS_COLOUR: Record<string, string> = {
  DRAFT: 'default',
  PLACED: 'blue',
  CONFIRMED: 'cyan',
  ALLOCATED: 'geekblue',
  PACKED: 'purple',
  DISPATCHED: 'orange',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  ALLOCATED: 'Allocated',
  PACKED: 'Packed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export interface NextStep {
  /** The button label — a verb, because it performs the transition. */
  label: string;
  /** What actually happens. Shown in the confirmation, not as a tooltip. */
  effect: string;
  permission: Permission;
  danger?: boolean;
}

/**
 * The one place the order lifecycle is written down on the client.
 *
 * The server owns the real rule — every transition is refused server-side if it
 * is out of order — so this is a usability layer: it decides which single
 * button to offer next. Keeping it as data rather than a chain of conditionals
 * inside the drawer is what stops a seventh status quietly being unreachable.
 *
 * Forward only. There is no un-confirm and no un-dispatch; the way back is
 * cancel, which releases the reservations and leaves the trail intact.
 */
export const NEXT_STEP: Record<string, NextStep | undefined> = {
  DRAFT: {
    label: 'Place order',
    effect:
      'Re-prices every line against the price list in force today, then commits the order. Any line whose rate has moved since the draft was saved will be listed back to you.',
    permission: 'ORDER_CREATE',
  },
  PLACED: {
    label: 'Confirm',
    effect:
      'Commits the order commercially. For a B2B customer the credit limit is checked here, against everything currently unpaid.',
    permission: 'ORDER_CONFIRM',
  },
  CONFIRMED: {
    label: 'Allocate stock',
    effect:
      'Picks batches first-expiry-first-out from QA-released stock in this order’s warehouse and reserves them. The result is the picking slip — the panel does not choose batches.',
    permission: 'ORDER_ALLOCATE',
  },
  ALLOCATED: {
    label: 'Mark packed',
    effect: 'The reserved batches have been picked and packed for this order.',
    permission: 'ORDER_PACK',
  },
  PACKED: {
    label: 'Dispatch',
    effect:
      'Stock leaves the building. A stock-out movement is written for every allocated batch, so the ledger and the warehouse balance both move now.',
    permission: 'ORDER_DISPATCH',
  },
  DISPATCHED: {
    label: 'Mark delivered',
    effect: 'The customer has received the goods. This closes the order.',
    permission: 'ORDER_DELIVER',
  },
};

/** Cancellable up to the point the goods leave. After dispatch it is a return, not a cancellation. */
export const CANCELLABLE: OrderStatus[] = ['DRAFT', 'PLACED', 'CONFIRMED', 'ALLOCATED', 'PACKED'];
