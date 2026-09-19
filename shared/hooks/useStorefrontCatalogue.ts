import type { AxiosInstance } from 'axios';
import { useQuery } from '@tanstack/react-query';
import { storefrontCatalogueApi, type StorefrontCatalogueQuery } from '../api/catalogue';
import { queryKeys } from '../api/queryKeys';
import type { StorefrontChannel } from '../api/types';

/**
 * Published products for one shelf, category or the whole catalogue.
 *
 * `client` should be the caller's own axios instance - see
 * storefrontCatalogueApi's doc comment.
 *
 * The channel is part of the cache key: a retailer and a shopper see different
 * prices for the same product, so they must never share a cache entry.
 */
export function useStorefrontProducts(
  query: StorefrontCatalogueQuery = {},
  client?: AxiosInstance,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.storefrontCatalogue.list(query),
    queryFn: () => storefrontCatalogueApi.list(query, client),
    staleTime: 60_000,
    enabled: options.enabled ?? true,
  });
}

/** One product with every detail-page section, priced for `channel`. */
export function useStorefrontProduct(
  idOrSlug: string | undefined,
  channel: StorefrontChannel,
  client?: AxiosInstance,
) {
  return useQuery({
    queryKey: queryKeys.storefrontCatalogue.detail(idOrSlug ?? '', channel),
    queryFn: () => storefrontCatalogueApi.get(idOrSlug as string, channel, client),
    enabled: Boolean(idOrSlug),
    staleTime: 60_000,
    // A 404 means "not published" - retrying would just delay the not-found screen.
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      return status !== 404 && failureCount < 2;
    },
  });
}
