import type { OrderDeliveryTask } from '@shared/api/types';

/**
 * "Where is this storefront order and what do I do next?" - one answer, used by
 * the order header, the progress banner and the Pack & Deliver tab, so they can
 * never disagree. The server still enforces the real rules; this only reads the
 * order (status + its rider-app delivery) and says it in plain words.
 */

export interface GuideOrder {
  status: string;
  fulfillmentMethod?: 'LOCAL' | 'SHIPROCKET' | null;
  riderName?: string | null;
  riderPhone?: string | null;
  allocations?: Array<{ releasedAt: string | null; scannedAt?: string | null }>;
  deliveryTask?: OrderDeliveryTask | null;
}

export type GuideTone = 'info' | 'warning' | 'success' | 'error';

export interface Guide {
  /** Index into FULFILMENT_STEPS; -1 when cancelled. */
  step: number;
  title: string;
  detail: string;
  tone: GuideTone;
  /** Label of the button that takes staff to the action; absent when nobody at the store has to act. */
  cta?: string;
}

export const FULFILMENT_STEPS = ['Placed', 'Packing', 'Packed', 'Out for delivery', 'Delivered'];

const LIVE_TASK = ['READY_FOR_PICKUP', 'OFFERED', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP', 'FAILED'];

/** The rider-app delivery that is still running, if any. */
export function liveTask(o: GuideOrder): OrderDeliveryTask | null {
  const t = o.deliveryTask;
  return t && LIVE_TASK.includes(t.status) ? t : null;
}

export function fulfilmentGuide(o: GuideOrder): Guide {
  const local = o.fulfillmentMethod === 'LOCAL';
  const task = liveTask(o);

  switch (o.status) {
    case 'CANCELLED':
      return { step: -1, tone: 'error', title: 'Cancelled', detail: 'Nothing more to do on this order.' };
    case 'DRAFT':
    case 'PLACED':
    case 'CONFIRMED':
      return {
        step: 0,
        tone: 'warning',
        title: 'Next: start packing',
        detail: 'Reserves the oldest valid batches (first expiry, first out) and gives you the pick list.',
        cta: 'Start packing',
      };
    case 'ALLOCATED': {
      const live = (o.allocations ?? []).filter((a) => !a.releasedAt);
      const left = live.filter((a) => !a.scannedAt).length;
      return {
        step: 1,
        tone: 'warning',
        title: 'Next: verify the picked batches',
        detail: `${left || 'All'} of ${live.length} batch label${live.length === 1 ? '' : 's'} still to scan. The order becomes Packed by itself after the last one.`,
        cta: 'Verify batches',
      };
    }
    case 'PACKED':
      if (!local) {
        return { step: 2, tone: 'warning', title: 'Next: create the courier shipment', detail: 'Books Shiprocket (AWB) and sends the order out.', cta: 'Create shipment' };
      }
      if (task?.rider && (task.status === 'ASSIGNED' || task.status === 'AT_PICKUP')) {
        return {
          step: 2,
          tone: 'info',
          title: task.status === 'AT_PICKUP' ? `${task.rider.fullName} is at the store` : `${task.rider.fullName} is coming to pick it up`,
          detail: 'Hand the packed order over. It moves to Out for delivery when the rider marks it picked up in the app.',
        };
      }
      if (task && task.offers.length > 0) {
        return {
          step: 2,
          tone: 'info',
          title: 'Waiting for a rider to accept',
          detail: `Offered to ${task.offers.map((x) => x.rider.fullName).join(', ')} (round ${task.offerRound}). The first to accept gets it. You can still assign a rider yourself.`,
        };
      }
      if (task && (task.needsManualAssignment || task.autoDispatchPaused)) {
        return {
          step: 2,
          tone: 'warning',
          title: 'Next: assign a rider',
          detail: task.autoDispatchPaused ? 'Auto-offer is paused for this delivery.' : 'No rider accepted the request. Pick one yourself.',
          cta: 'Assign rider',
        };
      }
      return { step: 2, tone: 'info', title: 'Finding a rider', detail: 'The delivery is being offered to the nearest available riders. You can also assign one yourself.', cta: 'Assign rider' };
    case 'DISPATCHED':
      if (!local) return { step: 3, tone: 'info', title: 'With the courier', detail: 'Closes by itself when Shiprocket reports delivery.' };
      if (task?.status === 'FAILED') {
        return { step: 3, tone: 'error', title: 'Delivery failed', detail: 'The rider is bringing the goods back. Re-attempt from the Delivery board once they are at the store.' };
      }
      if (task?.rider) {
        return {
          step: 3,
          tone: 'info',
          title: `Out for delivery with ${task.rider.fullName}`,
          detail: "Closes when the rider enters the customer's OTP in the app.",
        };
      }
      return {
        step: 3,
        tone: 'warning',
        title: "Next: enter the customer's OTP",
        detail: `${o.riderName ? `${o.riderName} (outside the rider app)` : 'The driver'} has it. Enter the OTP the customer reads out to close the order.`,
        cta: 'Enter OTP',
      };
    case 'DELIVERED':
      return { step: 4, tone: 'success', title: 'Delivered', detail: 'Order closed. Loyalty points were credited on delivery.' };
    default:
      return { step: 0, tone: 'info', title: o.status, detail: '' };
  }
}
