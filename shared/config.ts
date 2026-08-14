/**
 * Runtime configuration for whichever app is importing this.
 *
 * Read once from Vite's env at build time. Defaults point at the dev proxy
 * (`/api/v1` -> localhost:3000), so either app runs with no .env at all on a
 * developer machine.
 */
export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
} as const;

/**
 * Where the refresh token lives between page loads.
 *
 * The access token is deliberately NOT persisted - it is held in memory only,
 * so closing the tab discards it. The refresh token has to survive a reload or
 * every hard refresh would bounce the user back to the login screen, and the
 * API has no cookie-based session to lean on instead.
 *
 * -----------------------------------------------------------------------------
 * This is per-app, and on this deployment it has to be.
 *
 * The admin panel and the field app are served from the SAME ORIGIN
 * (svvbalaji.com and svvbalaji.com/field), so they share one localStorage. With
 * one key, signing into the field app on a phone would silently end the admin
 * session in the other tab and vice versa - the backend stores a single refresh
 * hash per user, so the second login rotates the first one away.
 *
 * Each app therefore sets VITE_TOKEN_KEY to its own value. The default here is
 * the admin panel's original key, so existing sessions survive this change.
 * -----------------------------------------------------------------------------
 */
export const REFRESH_TOKEN_STORAGE_KEY =
  import.meta.env.VITE_TOKEN_KEY ?? 'svv.refreshToken';
