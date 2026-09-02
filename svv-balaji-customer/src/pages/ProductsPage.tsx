import { Placeholder } from './Placeholder';

/**
 * The catalogue — FRD 29.1.
 *
 * Grid of finished products with category filter, search and sort. Reads the
 * product master, not finished-goods batches: a shopper buys "Foxtail Millet
 * 1kg", and which batch fills the order is an allocation decision made at
 * checkout, not something to put in front of them.
 */
export function ProductsPage() {
  return (
    <Placeholder
      frd="29.1"
      title="Shop"
      summary="Browsable product catalogue with category, search and sort, backed by the product master."
      blockedBy={
        <>
          A public, unauthenticated product listing endpoint. Everything under{' '}
          <code>/api/v1/products</code> is currently behind the staff guard, and a shop that
          requires a login to show its prices has no shoppers.
        </>
      }
    />
  );
}
