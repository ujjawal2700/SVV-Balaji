import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { affiliateApi } from '../api/affiliate';

const CODE = /^[A-Za-z0-9]{3,20}$/;

/**
 * Catches affiliate links on ANY page: `svvbalaji.com/?aff=CODE`,
 * `/product-detail/x?aff=CODE`, ... The server records the click and sets the
 * HTTP-only `aff_tracker` cookie (30 days, last click wins). The parameter is
 * then removed from the address bar, so a shared or bookmarked URL does not
 * re-count the click. `?ref=` is NOT this - that is refer-a-friend.
 */
export function useAffiliateTracker() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('aff')?.trim();
    if (!code) return;
    params.delete('aff');
    const rest = params.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '', hash: location.hash }, { replace: true });
    if (!CODE.test(code)) return;
    // Best-effort: a tracking hiccup must never get in the way of shopping.
    void affiliateApi.track(code.toUpperCase(), location.pathname, document.referrer).catch(() => undefined);
  }, [location.search, location.pathname, location.hash, navigate]);
}
