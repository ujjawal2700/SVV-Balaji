import { Injectable, Logger } from '@nestjs/common';
import { AddressParts, fromComponents, parseDuration } from './maps.logic';

export interface PlaceSuggestion {
  placeId: string;
  main: string;
  secondary: string | null;
}

export interface RouteResult {
  durationSeconds: number;
  distanceMeters: number;
  /** Google encoded polyline - the browser decodes it with the Maps geometry library. */
  polyline: string | null;
}

type LatLng = { lat: number; lng: number };

const TIMEOUT_MS = 4_000;
/** How long to stop asking an API that said "not enabled" before trying again. */
const DISABLED_BACKOFF_MS = 10 * 60_000;
const ROUTE_TTL_MS = 90_000;

/**
 * Google Maps Platform, server side. The key never leaves the server (the
 * browser has its own, referrer-restricted key for drawing maps).
 *
 * Everything degrades instead of failing: no key, an API not enabled on the
 * project, quota or network trouble -> autocomplete returns nothing, routes
 * return null, and callers fall back to what they did before (straight-line
 * distance, typing the address by hand). Places tries the New API first and
 * falls back to the legacy one, since a project may have either enabled.
 */
@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly key = process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
  private disabledUntil: Record<'placesNew' | 'placesLegacy' | 'routes' | 'geocoding', number> = {
    placesNew: 0, placesLegacy: 0, routes: 0, geocoding: 0,
  };
  private routeCache = new Map<string, { at: number; value: RouteResult | null }>();
  private pincodeCache = new Map<string, LatLng | null>();

  get enabled() {
    return Boolean(this.key);
  }

  private off(api: keyof MapsService['disabledUntil']) {
    return Date.now() < this.disabledUntil[api];
  }

  private disable(api: keyof MapsService['disabledUntil'], why: string) {
    if (!this.off(api)) this.logger.warn(`Google ${api} unavailable for ${DISABLED_BACKOFF_MS / 60_000} min: ${why.slice(0, 200)}`);
    this.disabledUntil[api] = Date.now() + DISABLED_BACKOFF_MS;
  }

  private async json(url: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { status: res.status, body };
  }

  // ------------------------------------------------------------------ places

  /** Address suggestions for what the shopper typed, biased to near `near` when given. India only. */
  async autocomplete(input: string, sessionToken: string, near?: LatLng): Promise<PlaceSuggestion[]> {
    const q = input.trim();
    if (!this.key || q.length < 3) return [];
    try {
      if (!this.off('placesNew')) {
        const r = await this.json('https://places.googleapis.com/v1/places:autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key },
          body: JSON.stringify({
            input: q,
            sessionToken,
            includedRegionCodes: ['in'],
            languageCode: 'en',
            ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30_000 } } } : {}),
          }),
        });
        if (r.status === 200) {
          return (r.body?.suggestions ?? [])
            .map((s: any) => s.placePrediction)
            .filter(Boolean)
            .map((p: any) => ({
              placeId: p.placeId,
              main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
              secondary: p.structuredFormat?.secondaryText?.text ?? null,
            }));
        }
        if (r.status === 403) this.disable('placesNew', r.body?.error?.message ?? 'forbidden');
        else return [];
      }
      if (this.off('placesLegacy')) return [];
      const params = new URLSearchParams({ input: q, sessiontoken: sessionToken, components: 'country:in', language: 'en', key: this.key });
      if (near) {
        params.set('location', `${near.lat},${near.lng}`);
        params.set('radius', '30000');
      }
      const r = await this.json(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
      if (r.body?.status === 'REQUEST_DENIED') {
        this.disable('placesLegacy', r.body?.error_message ?? 'denied');
        return [];
      }
      return (r.body?.predictions ?? []).map((p: any) => ({
        placeId: p.place_id,
        main: p.structured_formatting?.main_text ?? p.description,
        secondary: p.structured_formatting?.secondary_text ?? null,
      }));
    } catch (err) {
      this.logger.warn(`Autocomplete failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** The chosen suggestion as our address fields + pin. Ends the autocomplete session (one billable session). */
  async placeDetails(placeId: string, sessionToken: string): Promise<AddressParts | null> {
    if (!this.key || !/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return null;
    try {
      if (!this.off('placesNew')) {
        const r = await this.json(
          `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`,
          { headers: { 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': 'addressComponents,location,formattedAddress' } },
        );
        if (r.status === 200) {
          return fromComponents(r.body?.addressComponents, r.body?.formattedAddress, r.body?.location?.latitude, r.body?.location?.longitude);
        }
        if (r.status === 403) this.disable('placesNew', r.body?.error?.message ?? 'forbidden');
        else return null;
      }
      if (this.off('placesLegacy')) return null;
      const params = new URLSearchParams({
        place_id: placeId, sessiontoken: sessionToken, fields: 'address_component,geometry,formatted_address', language: 'en', key: this.key,
      });
      const r = await this.json(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
      if (r.body?.status === 'REQUEST_DENIED') {
        this.disable('placesLegacy', r.body?.error_message ?? 'denied');
        return null;
      }
      const res = r.body?.result;
      if (!res) return null;
      return fromComponents(res.address_components, res.formatted_address, res.geometry?.location?.lat, res.geometry?.location?.lng);
    } catch (err) {
      this.logger.warn(`Place details failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Address for a dropped pin / "use my location". */
  async reverseGeocode(lat: number, lng: number): Promise<AddressParts | null> {
    if (!this.key || this.off('geocoding')) return null;
    try {
      const params = new URLSearchParams({ latlng: `${lat},${lng}`, language: 'en', key: this.key });
      const r = await this.json(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
      if (r.body?.status === 'REQUEST_DENIED') {
        this.disable('geocoding', r.body?.error_message ?? 'denied');
        return null;
      }
      const best = r.body?.results?.[0];
      if (!best) return null;
      // Keep the shopper's own pin, not the centre of whatever Google matched.
      return { ...fromComponents(best.address_components, best.formatted_address, lat, lng) };
    } catch (err) {
      this.logger.warn(`Reverse geocode failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Rough centre of an Indian pincode, for "deliver to 452001?" before there is
   * an address. Cached in memory - pincodes do not move, and a product page
   * checked a thousand times for one pincode costs one Google call.
   */
  async geocodePincode(pincode: string): Promise<LatLng | null> {
    if (!this.key || !/^[1-9]\d{5}$/.test(pincode)) return null;
    if (this.pincodeCache.has(pincode)) return this.pincodeCache.get(pincode)!;
    if (this.off('geocoding')) return null;
    try {
      const params = new URLSearchParams({ components: `postal_code:${pincode}|country:IN`, key: this.key });
      const r = await this.json(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
      if (r.body?.status === 'REQUEST_DENIED') {
        this.disable('geocoding', r.body?.error_message ?? 'denied');
        return null;
      }
      const loc = r.body?.results?.[0]?.geometry?.location;
      // ZERO_RESULTS is an answer too (not a real pincode) - remember it so it is not asked again.
      const value = loc && typeof loc.lat === 'number' ? { lat: loc.lat, lng: loc.lng } : null;
      if (r.body?.status === 'OK' || r.body?.status === 'ZERO_RESULTS') {
        if (this.pincodeCache.size > 20_000) this.pincodeCache.clear();
        this.pincodeCache.set(pincode, value);
      }
      return value;
    } catch (err) {
      this.logger.warn(`Pincode geocode failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // ------------------------------------------------------------------ routes

  /**
   * Road route for a two-wheeler, cached per `cacheKey` for 90 s so every
   * customer refresh of one delivery shares one Routes call. Null when the
   * Routes API is not available - the caller shows straight-line distance.
   */
  async route(cacheKey: string, from: LatLng, to: LatLng): Promise<RouteResult | null> {
    if (!this.key) return null;
    const hit = this.routeCache.get(cacheKey);
    if (hit && Date.now() - hit.at < ROUTE_TTL_MS) return hit.value;
    if (this.off('routes')) return null;
    let value: RouteResult | null = null;
    try {
      const r = await this.json('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.key,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
          destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
          travelMode: 'TWO_WHEELER',
          routingPreference: 'TRAFFIC_AWARE',
        }),
      });
      if (r.status === 403) this.disable('routes', r.body?.error?.message ?? 'forbidden');
      const route = r.status === 200 ? r.body?.routes?.[0] : null;
      const seconds = parseDuration(route?.duration);
      if (route && seconds !== null) {
        value = { durationSeconds: seconds, distanceMeters: Number(route.distanceMeters ?? 0), polyline: route.polyline?.encodedPolyline ?? null };
      }
    } catch (err) {
      this.logger.warn(`Route failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.routeCache.set(cacheKey, { at: Date.now(), value });
    if (this.routeCache.size > 2000) {
      const cutoff = Date.now() - ROUTE_TTL_MS;
      for (const [k, v] of this.routeCache) if (v.at < cutoff) this.routeCache.delete(k);
    }
    return value;
  }
}
