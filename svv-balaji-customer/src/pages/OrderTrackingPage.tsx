import { useParams } from 'react-router-dom';
import { Placeholder } from './Placeholder';

/**
 * Tracking one order — FRD 29.4.
 *
 * Status timeline from placement through dispatch to delivery. The two
 * timestamps this needs already exist: `orders.dispatchedAt` and
 * `orders.deliveredAt`, added in migration `20260819100000_order_delivery_timestamps`
 * for the delivery reports. Orders placed before that migration have nulls,
 * which must read as "not recorded" rather than being drawn as a pending step.
 */
export function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();

  return (
    <Placeholder
      frd="29.4"
      title="Order tracking"
      summary={
        <>
          Status timeline for order <code>{orderId}</code>, from placement to delivery.
        </>
      }
    />
  );
}
