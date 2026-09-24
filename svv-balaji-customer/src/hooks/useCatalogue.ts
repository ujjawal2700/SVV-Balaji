import { useStorefrontProduct, useStorefrontProducts } from '@shared/hooks/useStorefrontCatalogue';
import type { StorefrontCatalogueQuery } from '@shared/api/catalogue';
import type { StorefrontChannel, StorefrontProductCard } from '@shared/api/types';
import { api as storefrontApi } from '../api/client';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

/**
 * A retailer sees wholesale prices, everyone else (guests included) sees
 * consumer prices. Derived from the session role on every render, so flipping
 * the role switcher re-prices the page: the channel is part of each query key.
 */
export function useChannel(): StorefrontChannel {
  const { role } = useCustomerAuth();
  return role === 'RETAILER' ? 'B2B' : 'B2C';
}

/**
 * A listing card in the shape every product tile in this app already renders
 * (`name`, `variant`, `price`, `mrp`, `badge`, `image`) - it used to be the mock
 * arrays' shape, so the tiles did not need rewriting, only re-sourcing.
 */
export interface ShelfProduct {
  /** Real product id - what the cart and, later, order placement key on. */
  id: string;
  /** What the URL carries. Falls back to the id for a product with no slug. */
  slug: string;
  name: string;
  brand: string | null;
  variant: string;
  weight: string;
  /** GST-inclusive, for the current channel. Null when staff have not priced it for this channel. */
  price: number | null;
  /** Only present when it is genuinely higher than `price` - otherwise there is no discount to strike through. */
  mrp: number | null;
  badge: string | null;
  image: string;
  /** False = show "Out of stock" and do not offer Add. */
  purchasable: boolean;
  inStock: boolean;
  unit: string;
  rating: number | null;
  reviewCount: number | null;
}

const PLACEHOLDER_IMAGE = '/images/cat_namkeen.jpg';

export function toShelfProduct(card: StorefrontProductCard): ShelfProduct {
  const price = card.price ? card.price.unitPriceInclGst : null;
  return {
    id: card.id,
    slug: card.slug ?? card.id,
    name: card.name,
    brand: card.brand,
    variant: card.packLabel ?? '',
    weight: card.packLabel ?? '',
    price,
    mrp: card.mrp !== null && price !== null && card.mrp > price ? card.mrp : null,
    badge: card.badge,
    image: card.images[0] ?? PLACEHOLDER_IMAGE,
    // Unpriced products cannot be bought; unstocked ones only if backorder is allowed.
    purchasable: price !== null && (card.inStock || card.allowBackorder),
    inStock: card.inStock,
    unit: card.unit,
    rating: card.rating,
    reviewCount: card.reviewCount,
  };
}

/**
 * Live products for a shelf, category or the whole catalogue, priced for the
 * shopper's channel. Deliberately NO mock fallback: the six products that used
 * to be hardcoded here now live in the database, so falling back to a mock
 * copy would resurrect anything Super Admin deleted or unpublished.
 */
export function useCatalogueProducts(query: Omit<StorefrontCatalogueQuery, 'channel'> = {}, options: { enabled?: boolean } = {}) {
  const channel = useChannel();
  const result = useStorefrontProducts({ ...query, channel }, storefrontApi, options);
  return {
    ...result,
    products: (result.data ?? []).map(toShelfProduct),
    channel,
  };
}

/** One product with every detail-page section, priced for the shopper's channel. */
export function useCatalogueProduct(idOrSlug: string | undefined) {
  const channel = useChannel();
  return { ...useStorefrontProduct(idOrSlug, channel, storefrontApi), channel };
}
