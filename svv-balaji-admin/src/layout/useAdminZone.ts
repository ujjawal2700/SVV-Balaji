import { useCallback, useState, useEffect } from 'react';
import type { AdminZone } from './navigation';

const STORAGE_KEY = 'svv.admin.zone';

function readStored(): AdminZone {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'commerce' ? 'commerce' : 'supply';
  } catch {
    return 'supply';
  }
}

/**
 * Which half of the business this browser is currently working in — supply
 * (farmers, suppliers, raw material, production, warehouse) or commerce
 * (customers, storefront accounts, pricing, orders). It narrows the sidebar
 * to one domain at a time, nothing more: `can()` still runs on every item
 * exactly as before, so a role with no sales access gains nothing by
 * switching to "Customer & Retail" — see the `zone` field on NavItem.
 *
 * Persisted per-browser rather than per-account, because it is about
 * wayfinding, not access. Sign-in does not reset it; the panel remembers
 * which half you were last looking at.
 */
export function useAdminZone() {
  const [zone, setZoneState] = useState<AdminZone>(readStored);

  useEffect(() => {
    const handleSync = () => setZoneState(readStored());
    window.addEventListener('svv.admin.zone', handleSync);
    return () => window.removeEventListener('svv.admin.zone', handleSync);
  }, []);

  const setZone = useCallback((next: AdminZone) => {
    setZoneState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      window.dispatchEvent(new Event('svv.admin.zone'));
    } catch {
      // Private browsing / blocked storage — toggle still works this
      // session, it just won't be remembered on the next visit.
    }
  }, []);

  return [zone, setZone] as const;
}
