import { useParams } from 'react-router-dom';
import { Placeholder } from './Placeholder';

/**
 * One product — FRD 29.1 and 29.5.
 *
 * Description, pack sizes, price, add to cart, and the ratings and reviews from
 * 29.5. Reviews are the part with no schema behind it yet: there is no review
 * table, no rating aggregate and no rule about who may leave one. Verified-
 * purchase-only is the decision worth taking before the table exists, because
 * retrofitting it means deciding what to do with the reviews already collected.
 */
export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();

  return (
    <Placeholder
      frd="29.1 · 29.5"
      title="Product"
      summary={
        <>
          Detail, pack sizes and add-to-cart for product <code>{productId}</code>, with ratings and
          reviews below.
        </>
      }
      blockedBy={
        <>
          Reviews and ratings (29.5) have no schema — no review table, no aggregate, and no rule on
          who may write one. Raise verified-purchase-only as a decision before the table is created.
        </>
      }
    />
  );
}
