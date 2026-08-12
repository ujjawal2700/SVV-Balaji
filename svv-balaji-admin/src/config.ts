/**
 * Runtime configuration, read once from Vite's env at build time.
 *
 * Defaults point at the dev proxy (`/api/v1` -> localhost:3000), so the app
 * runs with no .env at all on a developer machine.
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
 */
export const REFRESH_TOKEN_STORAGE_KEY = 'svv.refreshToken';
