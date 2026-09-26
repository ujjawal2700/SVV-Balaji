import {
  isOpen,
  matchZone,
  parseBoundary,
  pickZone,
  pointInPolygon,
  productEligible,
  quickEta,
  quickFee,
  type LatLng,
  type ZoneShape,
} from './zone.logic';

// A ~2 km square around a made-up outlet. No real place is implied.
const OUTLET = { lat: 21.1458, lng: 79.0882 };
const SQUARE: LatLng[] = [
  [21.135, 79.078],
  [21.135, 79.098],
  [21.155, 79.098],
  [21.155, 79.078],
];

const zone = (over: Partial<ZoneShape> = {}): ZoneShape => ({
  id: 'z1', priority: 0, boundary: SQUARE, pincodes: [], maxRadiusKm: null, outlet: OUTLET, ...over,
});

describe('zone logic', () => {
  describe('pointInPolygon', () => {
    it('finds points inside and outside a polygon', () => {
      expect(pointInPolygon({ lat: 21.145, lng: 79.088 }, SQUARE)).toBe(true);
      expect(pointInPolygon({ lat: 21.16, lng: 79.088 }, SQUARE)).toBe(false);
      expect(pointInPolygon({ lat: 21.145, lng: 79.07 }, SQUARE)).toBe(false);
    });

    it('handles a concave (L-shaped) boundary', () => {
      const L: LatLng[] = [[0, 0], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0]];
      expect(pointInPolygon({ lat: 0.5, lng: 1.5 }, L)).toBe(true);
      expect(pointInPolygon({ lat: 1.5, lng: 1.5 }, L)).toBe(false); // the notch
      expect(pointInPolygon({ lat: 1.5, lng: 0.5 }, L)).toBe(true);
    });
  });

  describe('parseBoundary', () => {
    it('accepts 3+ valid points and rejects anything malformed', () => {
      expect(parseBoundary(SQUARE)).toEqual(SQUARE);
      expect(parseBoundary([[1, 2], [3, 4]])).toBeNull();
      expect(parseBoundary([[1, 2], [3, 4], ['x', 5]])).toBeNull();
      expect(parseBoundary([[1, 2], [3, 4], [95, 5]])).toBeNull();
      expect(parseBoundary(null)).toBeNull();
    });
  });

  describe('matchZone', () => {
    it('matches a pinned address inside the drawn boundary', () => {
      expect(matchZone(zone(), { lat: 21.145, lng: 79.088, pincode: null })?.by).toBe('BOUNDARY');
    });

    it('does not fall back to pincode when a pinned address is outside the boundary', () => {
      expect(matchZone(zone({ pincodes: ['440010'] }), { lat: 21.2, lng: 79.2, pincode: '440010' })).toBeNull();
    });

    it('matches an unpinned address by pincode', () => {
      expect(matchZone(zone({ pincodes: ['440 010'] }), { lat: null, lng: null, pincode: '440010' })?.by).toBe('PINCODE');
    });

    it('refuses an unpinned address when a radius cap cannot be checked', () => {
      expect(matchZone(zone({ pincodes: ['440010'], maxRadiusKm: 3 }), { lat: null, lng: null, pincode: '440010' })).toBeNull();
    });

    it('applies the radius cap even inside the boundary', () => {
      const z = zone({ maxRadiusKm: 0.5 });
      expect(matchZone(z, { lat: 21.1459, lng: 79.0883, pincode: null })).not.toBeNull();
      expect(matchZone(z, { lat: 21.153, lng: 79.095, pincode: null })).toBeNull(); // inside square, ~1 km out
    });

    it('supports a radius-only zone', () => {
      const z = zone({ boundary: null, maxRadiusKm: 2 });
      expect(matchZone(z, { lat: 21.15, lng: 79.09, pincode: null })?.by).toBe('RADIUS');
      expect(matchZone(z, { lat: 21.3, lng: 79.09, pincode: null })).toBeNull();
    });
  });

  describe('pickZone', () => {
    it('prefers the higher priority zone, then the nearer outlet', () => {
      const a = zone({ id: 'a', priority: 0 });
      const b = zone({ id: 'b', priority: 5 });
      expect(pickZone([a, b], { lat: 21.145, lng: 79.088, pincode: null })?.zoneId).toBe('b');
      const near = zone({ id: 'near', boundary: null, maxRadiusKm: 10 });
      const far = zone({ id: 'far', boundary: null, maxRadiusKm: 10, outlet: { lat: 21.19, lng: 79.12 } });
      expect(pickZone([far, near], { lat: 21.146, lng: 79.089, pincode: null })?.zoneId).toBe('near');
    });

    it('returns null when no zone covers the address', () => {
      expect(pickZone([zone()], { lat: 22, lng: 80, pincode: null })).toBeNull();
    });
  });

  describe('isOpen', () => {
    // 2026-09-26 is a Saturday. 04:00Z = 09:30 IST.
    const satMorningIst = new Date('2026-09-26T04:00:00Z');

    it('is always open with no windows', () => {
      expect(isOpen([], satMorningIst, 'Asia/Kolkata')).toBe(true);
    });

    it('checks the window in the zone timezone', () => {
      expect(isOpen([{ day: 6, open: '09:00', close: '21:00' }], satMorningIst, 'Asia/Kolkata')).toBe(true);
      expect(isOpen([{ day: 6, open: '10:00', close: '21:00' }], satMorningIst, 'Asia/Kolkata')).toBe(false);
      expect(isOpen([{ day: 5, open: '09:00', close: '21:00' }], satMorningIst, 'Asia/Kolkata')).toBe(false);
    });

    it('handles a window that runs past midnight', () => {
      const satEarly = new Date('2026-09-25T20:30:00Z'); // Sat 02:00 IST
      expect(isOpen([{ day: 5, open: '22:00', close: '03:00' }], satEarly, 'Asia/Kolkata')).toBe(true);
      expect(isOpen([{ day: 5, open: '22:00', close: '01:00' }], satEarly, 'Asia/Kolkata')).toBe(false);
    });
  });

  it('productEligible limits to chosen categories', () => {
    expect(productEligible('ALL_PRODUCTS', [], [null])).toBe(true);
    expect(productEligible('SELECTED_CATEGORIES', ['c1'], ['c2', 'c1'])).toBe(true);
    expect(productEligible('SELECTED_CATEGORIES', ['c1'], ['c2', null])).toBe(false);
  });

  it('quickEta and quickFee use the zone numbers, not constants', () => {
    const now = new Date('2026-09-26T04:00:00Z');
    const eta = quickEta(now, 12, 18);
    expect(eta.label).toBe('12-18 min');
    expect(eta.max.getTime() - now.getTime()).toBe(18 * 60_000);
    expect(quickFee(300, 25, 499)).toBe(25);
    expect(quickFee(500, 25, 499)).toBe(0);
    expect(quickFee(5000, 25, null)).toBe(25);
  });
});
