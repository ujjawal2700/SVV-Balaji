/**
 * Delivery-zone geometry and eligibility rules. Pure functions (no database),
 * unit-tested in zone.logic.spec.ts. Nothing here knows a real city, pincode,
 * outlet or minute count - all of that arrives as zone configuration.
 */

export type LatLng = [number, number]; // [lat, lng]

export interface OpeningWindow {
  /** 0 = Sunday ... 6 = Saturday, in the zone's timezone. */
  day: number;
  /** "HH:mm", 24h. A window may cross midnight (close < open). */
  open: string;
  close: string;
}

export interface ZoneShape {
  id: string;
  priority: number;
  boundary: LatLng[] | null;
  pincodes: string[];
  maxRadiusKm: number | null;
  outlet: { lat: number; lng: number } | null;
}

export interface AddressPoint {
  lat: number | null;
  lng: number | null;
  pincode: string | null;
}

const R_EARTH_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ray casting. Zones are city-scale, so treating lat/lng as planar is accurate
 * to metres; a point exactly on an edge may fall either side, which is fine for
 * a delivery boundary drawn by hand.
 */
export function pointInPolygon(point: { lat: number; lng: number }, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  const x = point.lng;
  const y = point.lat;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** A polygon as stored: at least 3 finite [lat, lng] pairs, else null. */
export function parseBoundary(raw: unknown): LatLng[] | null {
  if (!Array.isArray(raw)) return null;
  const pts = raw.filter(
    (p): p is LatLng =>
      Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180,
  );
  return pts.length >= 3 && pts.length === raw.length ? pts : null;
}

export function normalisePincode(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length === 6 ? d : null;
}

export interface ZoneMatch {
  zoneId: string;
  /** How the address was matched - shown to staff when explaining a decision. */
  by: 'BOUNDARY' | 'PINCODE' | 'RADIUS';
  distanceKm: number | null;
}

/**
 * Is this address inside this zone?
 *
 * - With a pin: inside the drawn boundary, or (no boundary) in a listed pincode,
 *   or (no boundary, no pincodes) within `maxRadiusKm` of the outlet.
 * - Without a pin: only a pincode match, and only when the zone has no radius
 *   cap - a cap cannot be checked without coordinates, and guessing would
 *   promise a delivery time the rider cannot make.
 * - `maxRadiusKm`, when set, always caps the distance from the outlet.
 */
export function matchZone(zone: ZoneShape, addr: AddressPoint): ZoneMatch | null {
  const hasPin = addr.lat !== null && addr.lng !== null;
  const pin = normalisePincode(addr.pincode);
  const pincodes = zone.pincodes.map(normalisePincode).filter((x): x is string => x !== null);
  const dist = hasPin && zone.outlet ? distanceKm({ lat: addr.lat!, lng: addr.lng! }, zone.outlet) : null;

  if (zone.maxRadiusKm !== null) {
    if (dist === null || dist > zone.maxRadiusKm) return null;
  }

  if (hasPin && zone.boundary) {
    return pointInPolygon({ lat: addr.lat!, lng: addr.lng! }, zone.boundary) ? { zoneId: zone.id, by: 'BOUNDARY', distanceKm: dist } : null;
  }
  if (pin && pincodes.includes(pin)) return { zoneId: zone.id, by: 'PINCODE', distanceKm: dist };
  if (!zone.boundary && pincodes.length === 0 && zone.maxRadiusKm !== null && dist !== null) {
    return { zoneId: zone.id, by: 'RADIUS', distanceKm: dist };
  }
  return null;
}

/** The zone that serves an address: highest priority, then the nearest outlet. */
export function pickZone(zones: ZoneShape[], addr: AddressPoint): ZoneMatch | null {
  const hits = zones
    .map((z) => ({ z, m: matchZone(z, addr) }))
    .filter((x): x is { z: ZoneShape; m: ZoneMatch } => x.m !== null)
    .sort((a, b) => b.z.priority - a.z.priority || (a.m.distanceKm ?? Infinity) - (b.m.distanceKm ?? Infinity));
  return hits[0]?.m ?? null;
}

const toMinutes = (hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function validWindow(w: unknown): w is OpeningWindow {
  if (!w || typeof w !== 'object') return false;
  const o = w as Record<string, unknown>;
  return (
    Number.isInteger(o.day) && (o.day as number) >= 0 && (o.day as number) <= 6 &&
    typeof o.open === 'string' && typeof o.close === 'string' &&
    toMinutes(o.open) !== null && toMinutes(o.close) !== null && o.open !== o.close
  );
}

/** Day of week (0 = Sun) and minutes past midnight of `now` in `timeZone`. */
export function localClock(now: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Open right now? No windows = always open. A window that closes before it
 * opens runs past midnight into the next day (e.g. Fri 22:00-02:00 covers
 * Saturday 01:30).
 */
export function isOpen(windows: OpeningWindow[], now: Date, timeZone: string): boolean {
  if (windows.length === 0) return true;
  const { day, minutes } = localClock(now, timeZone);
  const yesterday = (day + 6) % 7;
  return windows.some((w) => {
    const open = toMinutes(w.open)!;
    const close = toMinutes(w.close)!;
    if (open < close) return w.day === day && minutes >= open && minutes < close;
    // Overnight window.
    return (w.day === day && minutes >= open) || (w.day === yesterday && minutes < close);
  });
}

/** Human "08:00-22:00 today" style summary of when Quick opens next, for the "why not" message. */
export function todaysHours(windows: OpeningWindow[], now: Date, timeZone: string): string | null {
  if (windows.length === 0) return null;
  const { day } = localClock(now, timeZone);
  const today = windows.filter((w) => w.day === day).map((w) => `${w.open}–${w.close}`);
  return today.length ? today.join(', ') : 'closed today';
}

/** Products the zone's Quick promise covers. */
export function productEligible(
  scope: 'ALL_PRODUCTS' | 'SELECTED_CATEGORIES',
  categoryIds: string[],
  productCategoryIds: Array<string | null>,
): boolean {
  if (scope === 'ALL_PRODUCTS') return true;
  return productCategoryIds.some((c) => c !== null && categoryIds.includes(c));
}

export function quickEta(now: Date, minMinutes: number, maxMinutes: number) {
  return {
    min: new Date(now.getTime() + minMinutes * 60_000),
    max: new Date(now.getTime() + maxMinutes * 60_000),
    label: minMinutes === maxMinutes ? `${minMinutes} min` : `${minMinutes}-${maxMinutes} min`,
  };
}

export function quickFee(goodsTotal: number, fee: number, freeAbove: number | null): number {
  return freeAbove !== null && goodsTotal >= freeAbove ? 0 : fee;
}
