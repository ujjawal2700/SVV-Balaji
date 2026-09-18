/**
 * Where the storefront session's tokens live — deliberately separate from
 * `shared/api/tokenStore.ts` (the staff panel's store).
 *
 * Access token: memory only, same reasoning as the staff store (short-lived,
 * no benefit to persisting it, and persisting it would widen an XSS blast
 * radius for nothing).
 *
 * Refresh token: localStorage, under its own key (`VITE_TOKEN_KEY`, default
 * `svv.customer.refreshToken`). This MUST differ from the admin panel's and
 * field app's keys — all three are served from one origin in production, and
 * with one shared key a customer signing in here would rotate away a staff
 * session's refresh token in another tab (the backend keeps one refresh hash
 * per account, and the storefront's is on CustomerAccount, not User — but a
 * shared *browser* key would still let one login corrupt the other's stored
 * token).
 */
const STORAGE_KEY = import.meta.env.VITE_TOKEN_KEY ?? 'svv.customer.refreshToken';

let accessToken: string | null = null;

let sessionLostHandler: (() => void) | null = null;

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  getRefreshToken(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },

  set(tokens: { accessToken: string; refreshToken: string }) {
    accessToken = tokens.accessToken;
    try {
      window.localStorage.setItem(STORAGE_KEY, tokens.refreshToken);
    } catch {
      /* see getRefreshToken */
    }
  },

  clear() {
    accessToken = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* see getRefreshToken */
    }
  },

  onSessionLost(handler: () => void) {
    sessionLostHandler = handler;
  },

  notifySessionLost() {
    sessionLostHandler?.();
  },
};
