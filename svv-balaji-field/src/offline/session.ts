import type { AuthUser } from '@shared/auth/types';
import { REFRESH_TOKEN_STORAGE_KEY } from '@shared/config';

/**
 * The signed-in user's profile, kept on the device.
 *
 * Opening the app normally restores the session by refreshing the token and
 * asking the server who you are - which needs a network. With no signal the
 * field app instead reopens with this saved profile (only while the refresh
 * token is still on the device, i.e. the user never signed out) and catches up
 * with the server once the connection is back.
 */
const PROFILE_KEY = `${REFRESH_TOKEN_STORAGE_KEY}.profile`;

let current: AuthUser | null = null;

export const offlineProfile = {
  load(): AuthUser | null {
    try {
      const raw = window.localStorage.getItem(PROFILE_KEY);
      current = raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      current = null;
    }
    return current;
  },
  save(user: AuthUser | null) {
    current = user;
    try {
      if (user) window.localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
      else window.localStorage.removeItem(PROFILE_KEY);
    } catch {
      // Private mode / storage full: offline start just will not be available.
    }
  },
  /** The user the app is running as right now (online or offline). */
  current: (): AuthUser | null => current,
};
