/// <reference types="google.maps" />
/**
 * Loads the Google Maps JavaScript API once, on first use, with the
 * referrer-restricted browser key. Resolves to null when there is no key or the
 * script cannot load (blocked, offline, key refused) - callers then fall back to
 * the OpenStreetMap / Leaflet map, so a Google problem never blanks a screen.
 */
const KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';

let loading: Promise<typeof google | null> | null = null;

export function googleMapsAvailable() {
  return Boolean(KEY);
}

export function loadGoogleMaps(): Promise<typeof google | null> {
  if (!KEY) return Promise.resolve(null);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const w = window as unknown as { google?: typeof google; __svvGmapsReady?: () => void; gm_authFailure?: () => void };
    if (w.google?.maps) return resolve(w.google);
    const done = (v: typeof google | null) => resolve(v);
    const timer = window.setTimeout(() => done(null), 12_000);
    w.__svvGmapsReady = () => {
      window.clearTimeout(timer);
      done(w.google ?? null);
    };
    // Google calls this when the key is refused (wrong referrer, API not enabled, billing).
    w.gm_authFailure = () => {
      authFailed = true;
      listeners.forEach((l) => l());
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&libraries=geometry&region=IN&language=en&callback=__svvGmapsReady`;
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

let authFailed = false;
const listeners = new Set<() => void>();

/** Google refused the key after loading: map tiles turn grey. Components switch back to Leaflet. */
export function onGoogleAuthFailure(fn: () => void): () => void {
  if (authFailed) fn();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
