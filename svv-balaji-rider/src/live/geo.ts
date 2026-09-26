export interface Point {
  latitude: number;
  longitude: number;
}

/** Current position, or null if unavailable / denied / too slow. Never throws. */
export function currentPosition(timeoutMs = 10_000): Promise<Point | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 },
    );
  });
}

export async function locationPermission(): Promise<PermissionState | 'unsupported'> {
  try {
    if (!navigator.permissions) return 'unsupported';
    return (await navigator.permissions.query({ name: 'geolocation' as PermissionName })).state;
  } catch {
    return 'unsupported';
  }
}
