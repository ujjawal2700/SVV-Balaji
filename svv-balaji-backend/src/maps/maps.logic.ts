/**
 * Turning Google's address payloads into our address fields. Pure, so the
 * Places (New) and legacy shapes - which the key's project may have either of -
 * are tested on plain data.
 */

export interface AddressParts {
  /** Street / building, when Google has one. */
  line1: string | null;
  /** Locality / neighbourhood ("Arera Colony"). */
  line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  formatted: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** One component in either shape: New = longText/types, legacy = long_name/types. */
export interface RawComponent {
  longText?: string;
  long_name?: string;
  types?: string[];
}

export function fromComponents(
  components: RawComponent[] | undefined,
  formatted: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): AddressParts {
  const list = components ?? [];
  const pick = (...types: string[]) => {
    for (const t of types) {
      const c = list.find((x) => x.types?.includes(t));
      const v = c?.longText ?? c?.long_name;
      if (v) return v;
    }
    return null;
  };
  const street = [pick('premise', 'subpremise'), pick('street_number'), pick('route')].filter(Boolean).join(', ');
  const pincode = pick('postal_code');
  return {
    line1: street || null,
    line2: pick('sublocality_level_1', 'sublocality', 'neighborhood', 'sublocality_level_2'),
    // Indian addresses: locality is the city; some rural results only carry the district.
    city: pick('locality', 'administrative_area_level_3', 'administrative_area_level_2'),
    state: pick('administrative_area_level_1'),
    pincode: pincode && /^[1-9]\d{5}$/.test(pincode) ? pincode : null,
    formatted: formatted ?? null,
    latitude: typeof lat === 'number' ? Math.round(lat * 1e6) / 1e6 : null,
    longitude: typeof lng === 'number' ? Math.round(lng * 1e6) / 1e6 : null,
  };
}

/** "123s" -> 123 (the Routes API returns durations as protobuf strings). */
export function parseDuration(d: string | undefined | null): number | null {
  if (!d) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d);
  return m ? Math.round(Number(m[1])) : null;
}
