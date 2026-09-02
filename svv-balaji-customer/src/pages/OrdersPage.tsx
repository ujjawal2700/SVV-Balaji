import { Placeholder } from './Placeholder';

/**
 * Order history — FRD 29.3.
 *
 * The customer's own orders, newest first, each linking to its tracking page.
 * Scoped by ownership on the server. This must never be the admin sales list
 * with a filter applied on the client: a filter that can be removed in dev tools
 * is not a boundary.
 */
export function OrdersPage() {
  return (
    <Placeholder
      frd="29.3"
      title="My orders"
      summary="The signed-in customer's own orders, newest first, each linking through to tracking."
      blockedBy={
        <>
          A customer-scoped orders endpoint that derives ownership from the session rather than
          taking a customer id from the request.
        </>
      }
    />
  );
}
