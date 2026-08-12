import { REFRESH_TOKEN_STORAGE_KEY } from '../config';

/**
 * Where the session's tokens live.
 *
 * Access token: memory only. It expires in 15 minutes and is replaced often, so
 * persisting it buys nothing and widens the blast radius of an XSS bug.
 *
 * Refresh token: localStorage. It has to survive a page reload, and this API
 * has no httpOnly cookie session to lean on. That is a known trade-off rather
 * than an oversight - if we later move refresh to a cookie, this module is the
 * only place that changes.
 */
let accessToken: string | null = null;

/** Called when the session can no longer be recovered, so the app can redirect. */
let sessionLostHandler: (() => void) | null = null;

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  getRefreshToken(): string | null {
    try {
      return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
    } catch {
      // Private browsing modes can throw on storage access. Losing the refresh
      // token degrades to "log in again", which is survivable.
      return null;
    }
  },

  set(tokens: { accessToken: string; refreshToken: string }) {
    accessToken = tokens.accessToken;
    try {
      window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
    } catch {
      /* see getRefreshToken */
    }
  },

  clear() {
    accessToken = null;
    try {
      window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
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
