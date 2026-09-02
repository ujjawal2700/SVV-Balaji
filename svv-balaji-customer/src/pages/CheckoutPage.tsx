import { Placeholder } from './Placeholder';

/**
 * Checkout — second half of FRD 29.2.
 *
 * Where the browser-side cart becomes a real order: delivery address, server-
 * side re-pricing of every line, a stock check, then order creation and payment.
 *
 * The gap here is not cosmetic. The whole sales module was built for B2B — an
 * order belongs to a `Customer` with a credit limit, a payment term and a price
 * list, and is placed by a staff member on that customer's behalf. A member of
 * the public has none of those. Whether a B2C order reuses `Order` with a
 * different customer type, or is its own thing, is the first design decision of
 * WS3.5 and it is a client conversation, not a coding one.
 */
export function CheckoutPage() {
  return (
    <Placeholder
      frd="29.2"
      title="Checkout"
      summary="Address, server-side re-pricing, stock check, order creation, payment."
      blockedBy={
        <>
          A B2C order path. The existing <code>Order</code> model assumes a B2B{' '}
          <code>Customer</code> with a credit limit, payment terms and a price list — none of which
          a walk-up shopper has. Decide whether B2C reuses that model before building this screen.
          Payment gateway selection (WS4.x) is also still open.
        </>
      }
    />
  );
}
