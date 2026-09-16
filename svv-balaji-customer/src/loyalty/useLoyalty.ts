import { useContext } from 'react';
import { LoyaltyContext } from './LoyaltyProvider';
import type { LoyaltyApi } from './types';

/**
 * Throws rather than returning a zeroed-out balance when the provider is
 * missing — same reasoning as useCart: a silently empty balance looks exactly
 * like a shopper who has never earned a point, and the bug would surface as
 * "my points disappeared" rather than a stack trace pointing at the real cause.
 */
export function useLoyalty(): LoyaltyApi {
  const loyalty = useContext(LoyaltyContext);
  if (!loyalty) throw new Error('useLoyalty must be used inside <LoyaltyProvider>');
  return loyalty;
}
