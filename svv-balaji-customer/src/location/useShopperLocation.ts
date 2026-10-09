import { useSyncExternalStore } from 'react';

/**
 * Where the shopper says they are, for the header ("📍 Arera Colony, Bhopal").
 * Display only: checkout still decides delivery from the address actually
 * chosen there. Kept per device in localStorage, shared by every header via a
 * tiny store so picking it in one place updates the others at once.
 */
export interface ShopperLocation {
  /** Short line for the header, e.g. "Arera Colony". */
  title: string;
  /** City / full line under it, e.g. "Bhopal, Madhya Pradesh 462016". */
  subtitle: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: 'GPS' | 'ADDRESS' | 'SEARCH' | 'MANUAL';
}

const KEY = 'svv.shopperLocation';
const listeners = new Set<() => void>();

function read(): ShopperLocation | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ShopperLocation) : null;
  } catch {
    return null;
  }
}

let current: ShopperLocation | null = read();

export function setShopperLocation(next: ShopperLocation | null) {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode / blocked storage: it still holds for this session.
  }
  listeners.forEach((l) => l());
}

export function useShopperLocation() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** "Arera Colony, Bhopal" - what fits in one header line. */
export function locationLine(l: ShopperLocation) {
  const city = l.subtitle?.split(',')[0]?.trim();
  return city && city !== l.title ? `${l.title}, ${city}` : l.title;
}
