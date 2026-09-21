import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { loyaltyApi } from '../api/loyalty';
import { useChannel } from '../hooks/useCatalogue';

/**
 * What a basket would earn RIGHT NOW, worked out by the server with the same
 * engine that credits the real order - so a rate or eligibility change made in
 * the admin panel shows up here on the next request, and a product that is not
 * eligible says so instead of promising points it will never pay.
 *
 * Guests get an answer too (the rates are public): "sign in to earn" is a better
 * nudge with the real number in it.
 */
export function useLoyaltyEstimate(lines: Array<{ productId: string; quantity: number }>) {
  const channel = useChannel();
  const wanted = lines.filter((l) => l.productId && l.quantity > 0);
  const key = wanted.map((l) => `${l.productId}:${l.quantity}`).sort().join(',');

  return useQuery({
    queryKey: ['storefront', 'loyalty', 'estimate', channel, key],
    queryFn: () => loyaltyApi.estimate(wanted, channel),
    enabled: wanted.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
