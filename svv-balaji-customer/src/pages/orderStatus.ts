import type { FulfillmentMethod } from '../api/checkout';

export interface TrackingStep {
  key: string;
  label: string;
}

/** Standard E-Commerce Courier Shipping Steps (3PL / Shiprocket) */
export const STANDARD_SHIPPING_STEPS: TrackingStep[] = [
  { key: 'ORDER_RECEIVED', label: 'Order Received' },
  { key: 'MANIFESTED', label: 'Ready to Ship / Manifested' },
  { key: 'PICKED_UP', label: 'Picked Up' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'ARRIVED_AT_HUB', label: 'Arrived at Hub / Reached Destination' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out For Delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
];

/** Quick Local Delivery Steps (Rider) */
export const QUICK_DELIVERY_STEPS: TrackingStep[] = [
  { key: 'PLACED', label: 'Order Placed' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'RIDER_ASSIGNED', label: 'Rider Assigned' },
  { key: 'PICKED_UP', label: 'Order Picked Up' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out For Delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
];

export function statusLabel(
  status: string,
  method?: FulfillmentMethod | null,
  shipmentStatus?: string | null,
): string {
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'DELIVERED') return 'Delivered';

  if (method === 'LOCAL') {
    switch (status) {
      case 'PLACED': return 'Order Placed';
      case 'CONFIRMED':
      case 'ALLOCATED': return 'Confirmed';
      case 'PACKED': return 'Ready for Pickup';
      case 'DISPATCHED': return 'Out For Delivery';
      default: return status;
    }
  }

  // Standard Delivery (3PL Courier)
  if (shipmentStatus) {
    const s = shipmentStatus.toUpperCase();
    if (s.includes('DELIVERED')) return 'Delivered';
    if (s.includes('OUT') && s.includes('DELIVERY')) return 'Out For Delivery';
    if (s.includes('HUB') || s.includes('REACHED') || s.includes('DESTINATION')) return 'Arrived at Hub';
    if (s.includes('TRANSIT')) return 'In Transit';
    if (s.includes('PICKED')) return 'Picked Up';
    if (s.includes('MANIFEST') || s.includes('READY') || s.includes('LABEL')) return 'Ready to Ship / Manifested';
  }

  switch (status) {
    case 'PLACED': return 'Order Received';
    case 'CONFIRMED': return 'Confirmed';
    case 'ALLOCATED':
    case 'PACKED': return 'Ready to Ship / Manifested';
    case 'DISPATCHED': return 'In Transit';
    default: return status;
  }
}

export function statusColor(status: string): string {
  if (status === 'DELIVERED') return 'green';
  if (status === 'CANCELLED') return 'red';
  if (status === 'DISPATCHED') return 'blue';
  return 'orange';
}

/** Get tracking steps array depending on fulfillment method */
export function getProgressSteps(method: FulfillmentMethod | null | undefined): TrackingStep[] {
  return method === 'LOCAL' ? QUICK_DELIVERY_STEPS : STANDARD_SHIPPING_STEPS;
}

/** Calculate step index for Quick Local Delivery */
export function getQuickDeliveryIndex(
  status: string,
  hasRider: boolean,
  timelineTypes: string[] = [],
): number {
  if (status === 'DELIVERED') return 5;
  if (status === 'DISPATCHED') {
    if (timelineTypes.includes('RIDER_PICKED_UP') || timelineTypes.includes('PICKED_UP')) return 4;
    return 4; // Out For Delivery
  }
  if (status === 'PACKED' || status === 'ALLOCATED') {
    if (timelineTypes.includes('RIDER_PICKED_UP')) return 3;
    if (hasRider) return 2; // Rider Assigned
    return 1; // Confirmed
  }
  if (status === 'CONFIRMED') return 1;
  return 0; // Order Placed
}

/** Calculate step index for Standard Courier Delivery */
export function getStandardShippingIndex(
  status: string,
  shipmentStatus?: string | null,
  timelineTypes: string[] = [],
): number {
  if (status === 'DELIVERED') return 6;

  if (shipmentStatus) {
    const s = shipmentStatus.toUpperCase();
    if (s.includes('DELIVERED')) return 6;
    if (s.includes('OUT') && s.includes('DELIVERY')) return 5;
    if (s.includes('HUB') || s.includes('REACHED') || s.includes('DESTINATION')) return 4;
    if (s.includes('TRANSIT')) return 3;
    if (s.includes('PICKED')) return 2;
    if (s.includes('MANIFEST') || s.includes('READY') || s.includes('LABEL')) return 1;
  }

  if (timelineTypes.includes('ARRIVED_AT_HUB')) return 4;
  if (timelineTypes.includes('IN_TRANSIT')) return 3;
  if (timelineTypes.includes('PICKED_UP') || timelineTypes.includes('COURIER_PICKED_UP')) return 2;

  if (status === 'DISPATCHED') return 3; // In Transit
  if (status === 'PACKED' || status === 'ALLOCATED') return 1; // Ready to Ship
  return 0; // Order Received
}

/** Backward compatibility exports */
export function progressSteps(method: FulfillmentMethod | null | undefined) {
  return getProgressSteps(method);
}

export function progressIndex(
  status: string,
  method?: FulfillmentMethod | null,
  hasRider?: boolean,
  shipmentStatus?: string | null,
  timelineTypes: string[] = [],
): number {
  if (method === 'LOCAL') {
    return getQuickDeliveryIndex(status, Boolean(hasRider), timelineTypes);
  }
  return getStandardShippingIndex(status, shipmentStatus, timelineTypes);
}
