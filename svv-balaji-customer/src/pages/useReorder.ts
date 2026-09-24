import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { OrderLine } from '../api/checkout';
import { useCart } from '../cart/useCart';

/**
 * Put a past order's products back in the cart and open it. The price shown is
 * the old one for display only - checkout re-prices every line and tells the
 * shopper before paying if anything moved. Products no longer on sale are skipped.
 */
export function useReorder() {
  const cart = useCart();
  const navigate = useNavigate();

  return (lines: OrderLine[]) => {
    const available = lines.filter((l) => l.available);
    if (available.length === 0) {
      message.warning('These products are no longer available');
      return;
    }
    for (const l of available) {
      cart.add(
        {
          productId: l.productId,
          productName: l.name ?? 'Product',
          unit: l.unit,
          imageUrl: l.imageUrl,
          mrp: l.mrp,
          displayUnitPrice: l.unitPrice,
        },
        l.quantity,
      );
    }
    const skipped = lines.length - available.length;
    message.success(
      skipped > 0
        ? `Added ${available.length} item${available.length === 1 ? '' : 's'} to your cart · ${skipped} no longer available`
        : `Added ${available.length} item${available.length === 1 ? '' : 's'} to your cart`,
    );
    navigate('/cart');
  };
}
