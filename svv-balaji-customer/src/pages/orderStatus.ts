import type { FulfillmentMethod } from '../api/checkout';

/**
 * What the shopper reads for each status Super Admin's panel uses. One vocabulary
 * for both apps: PLACED..DELIVERED are the same statuses, worded for a customer.
 */
export function statusLabel(status: string, method: FulfillmentMethod | null | undefined): string {
  switch (status) {
    case 'PLACED': return 'Order placed';
    case 'CONFIRMED': return 'Confirmed';
    case 'ALLOCATED': return 'Being packed';
    case 'PACKED': return 'Packed';
    case 'DISPATCHED': return method === 'LOCAL' ? 'Out for delivery' : 'Shipped';
    case 'DELIVERED': return 'Delivered';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

export function statusColor(status: string): string {
  if (status === 'DELIVERED') return 'green';
  if (status === 'CANCELLED') return 'red';
  if (status === 'DISPATCHED') return 'blue';
  return 'orange';
}

/** The four steps a shopper follows. The current step is derived from the server's status, not guessed. */
export function progressSteps(method: FulfillmentMethod | null | undefined) {
  return [
    { key: 'PLACED', label: 'Order placed' },
    { key: 'PACKED', label: 'Packed' },
    { key: 'DISPATCHED', label: method === 'LOCAL' ? 'Out for delivery' : 'Shipped' },
    { key: 'DELIVERED', label: 'Delivered' },
  ];
}

const ORDER = ['PLACED', 'CONFIRMED', 'ALLOCATED', 'PACKED', 'DISPATCHED', 'DELIVERED'];

/** Index into `progressSteps` for a status (Confirmed/Being packed still count as "placed"). */
export function progressIndex(status: string): number {
  const i = ORDER.indexOf(status);
  if (i < 0) return -1;
  if (i <= 2) return 0;
  return i - 2; // PACKED=1, DISPATCHED=2, DELIVERED=3
}
