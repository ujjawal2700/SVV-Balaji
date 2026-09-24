import type { AxiosInstance } from 'axios';
import { api } from './client';
import { unwrap, unwrapList } from './envelope';
import type {
  StorefrontChannel,
  StorefrontProductCard,
  StorefrontProductDetail,
} from './types';

export interface StorefrontCatalogueQuery {
  /** Decides which price list applies. Defaults to B2C server-side. */
  channel?: StorefrontChannel;
  /** A parent category slug also returns everything filed under its subcategories. */
  categorySlug?: string;
  /** Only products pinned to the "Popular Products" / Top Picks shelf. */
  topPick?: boolean;
  /** Only products pinned to the "Best of the Basics" shelf. */
  dailyStaple?: boolean;
  /** Free-text search across name, brand, SKU, pack label and category. */
  q?: string;
  limit?: number;
}

/**
 * The public, read-only catalogue. Deliberately unguarded on the server - it
 * only ever returns products staff have published - so it is safe to call
 * before a shopper signs in.
 *
 * Takes the caller's own axios instance, defaulting to the staff panel's `api`:
 * the customer app runs a separate client (see storefrontBannersApi's doc
 * comment for why) and must pass that one in.
 */
export const storefrontCatalogueApi = {
  async list(
    query: StorefrontCatalogueQuery = {},
    client: AxiosInstance = api,
  ): Promise<StorefrontProductCard[]> {
    const response = await client.get<StorefrontProductCard[]>('/storefront/catalogue/products', {
      // Booleans are sent only when true - the server treats absence as "no filter".
      params: {
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.categorySlug ? { categorySlug: query.categorySlug } : {}),
        ...(query.topPick ? { topPick: true } : {}),
        ...(query.dailyStaple ? { dailyStaple: true } : {}),
        ...(query.q?.trim() ? { q: query.q.trim() } : {}),
        ...(query.limit ? { limit: query.limit } : {}),
      },
    });
    return unwrapList<StorefrontProductCard>(response.data).data;
  },

  /** `idOrSlug` - links that predate the real catalogue carry the old mock ids, which were seeded as slugs. */
  async get(
    idOrSlug: string,
    channel: StorefrontChannel = 'B2C',
    client: AxiosInstance = api,
  ): Promise<StorefrontProductDetail> {
    const response = await client.get<StorefrontProductDetail>(
      `/storefront/catalogue/products/${encodeURIComponent(idOrSlug)}`,
      { params: { channel } },
    );
    return unwrap<StorefrontProductDetail>(response.data);
  },
};
