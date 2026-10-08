import { fromComponents, parseDuration } from './maps.logic';
import { MapsService } from './maps.service';

describe('maps.logic', () => {
  it('reads Places (New) components into our address fields', () => {
    const a = fromComponents(
      [
        { longText: '12', types: ['street_number'] },
        { longText: 'Link Road', types: ['route'] },
        { longText: 'Arera Colony', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { longText: 'Bhopal', types: ['locality', 'political'] },
        { longText: 'Madhya Pradesh', types: ['administrative_area_level_1', 'political'] },
        { longText: '462016', types: ['postal_code'] },
      ],
      '12, Link Road, Arera Colony, Bhopal',
      23.2149801,
      77.4329002,
    );
    expect(a).toEqual({
      line1: '12, Link Road', line2: 'Arera Colony', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462016',
      formatted: '12, Link Road, Arera Colony, Bhopal', latitude: 23.21498, longitude: 77.4329,
    });
  });

  it('reads the legacy shape too, and falls back to the district for rural results', () => {
    const a = fromComponents(
      [
        { long_name: 'Ashta', types: ['administrative_area_level_3'] },
        { long_name: 'Madhya Pradesh', types: ['administrative_area_level_1'] },
        { long_name: '46611', types: ['postal_code'] }, // malformed - dropped
      ],
      undefined, undefined, undefined,
    );
    expect(a).toMatchObject({ line1: null, line2: null, city: 'Ashta', state: 'Madhya Pradesh', pincode: null, latitude: null });
  });

  it('parses Routes API durations', () => {
    expect(parseDuration('734s')).toBe(734);
    expect(parseDuration('12.6s')).toBe(13);
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration('bad')).toBeNull();
  });
});

describe('MapsService (fetch mocked)', () => {
  const realFetch = global.fetch;
  const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  let calls: string[];

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    calls = [];
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it('falls back to legacy Places when the New API is not enabled, and stops asking New for a while', async () => {
    global.fetch = jest.fn((url: string) => {
      calls.push(url);
      if (url.startsWith('https://places.googleapis.com')) return reply(403, { error: { message: 'Places API (New) has not been used' } });
      return reply(200, { status: 'OK', predictions: [{ place_id: 'abc123def456', description: 'Arera Colony, Bhopal', structured_formatting: { main_text: 'Arera Colony', secondary_text: 'Bhopal' } }] });
    }) as unknown as typeof fetch;
    const maps = new MapsService();
    expect(await maps.autocomplete('Arera', 'session-0001')).toEqual([{ placeId: 'abc123def456', main: 'Arera Colony', secondary: 'Bhopal' }]);
    await maps.autocomplete('Arera C', 'session-0001');
    expect(calls.filter((u) => u.startsWith('https://places.googleapis.com'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/place/autocomplete/json'))).toHaveLength(2);
  });

  it('routes: null (not an error) when Routes is disabled; cached per key', async () => {
    global.fetch = jest.fn(() => {
      calls.push('routes');
      return reply(403, { error: { message: 'Routes API has not been used' } });
    }) as unknown as typeof fetch;
    const maps = new MapsService();
    expect(await maps.route('task:1', { lat: 23.26, lng: 77.41 }, { lat: 23.27, lng: 77.42 })).toBeNull();
    expect(await maps.route('task:1', { lat: 23.26, lng: 77.41 }, { lat: 23.27, lng: 77.42 })).toBeNull();
    expect(await maps.route('task:2', { lat: 23.26, lng: 77.41 }, { lat: 23.27, lng: 77.42 })).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('routes: parses a real answer', async () => {
    global.fetch = jest.fn(() => reply(200, { routes: [{ duration: '540s', distanceMeters: 2310, polyline: { encodedPolyline: 'abc' } }] })) as unknown as typeof fetch;
    const maps = new MapsService();
    expect(await maps.route('task:9', { lat: 1, lng: 2 }, { lat: 3, lng: 4 })).toEqual({ durationSeconds: 540, distanceMeters: 2310, polyline: 'abc' });
  });

  it('does nothing at all without a key', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    global.fetch = jest.fn() as unknown as typeof fetch;
    const maps = new MapsService();
    expect(await maps.autocomplete('Arera Colony', 'session-0001')).toEqual([]);
    expect(await maps.route('t', { lat: 1, lng: 2 }, { lat: 3, lng: 4 })).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
