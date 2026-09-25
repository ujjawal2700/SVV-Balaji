import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api/auth';
import { refreshOnce } from '../api/client';
import { tokenStore } from '../api/tokenStore';
import axios from 'axios';
import type { AuthUser } from './types';

/**
 * Lets an app keep working with no network (the field app). Omit it and nothing
 * changes: a failed session restore signs the user out, as it always has.
 */
export interface OfflineSession {
  /** The last profile this device saw for the signed-in user. */
  load: () => AuthUser | null;
  /** Called with every fresh profile, and with null on sign-out. */
  save: (user: AuthUser | null) => void;
}

/** "Could not reach the server" rather than "the server said no". */
function isUnreachable(error: unknown) {
  return axios.isAxiosError(error) && (!error.response || [502, 503, 504].includes(error.response.status));
}

export interface AuthContextValue {
  user: AuthUser | null;
  /** True until the boot-time session restore has settled, either way. */
  initialising: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children, offlineSession }: { children: ReactNode; offlineSession?: OfflineSession }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initialising, setInitialising] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Restore the session on boot.
   *
   * The access token only lives in memory, so a page reload always starts with
   * nothing. If a refresh token survived in storage we spend it for a fresh
   * pair before asking who we are - otherwise every hard refresh would dump the
   * user back at the login screen.
   */
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!tokenStore.getRefreshToken()) {
        if (!cancelled) setInitialising(false);
        return;
      }

      try {
        await refreshOnce();
        const profile = await authApi.me();
        offlineSession?.save(profile);
        if (!cancelled) setUser(profile);
      } catch (error) {
        // No signal is not a signed-out user. With an offline session and a
        // saved profile, carry on as that user; the tokens stay put and the
        // first request once back online refreshes them (or, if the session
        // was revoked meanwhile, signs the user out then).
        const saved = offlineSession && isUnreachable(error) ? offlineSession.load() : null;
        if (saved) {
          if (!cancelled) setUser(saved);
          return;
        }
        // Expired, revoked, or rotated away. Not an error worth surfacing -
        // the user simply has to sign in.
        tokenStore.clear();
        offlineSession?.save(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitialising(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The API client calls this when a refresh fails mid-session. Clearing the
   * user here is what flips the router over to the login screen, so a dead
   * session surfaces immediately rather than as a wall of failed requests.
   */
  useEffect(() => {
    tokenStore.onSessionLost(() => {
      offlineSession?.save(null);
      if (mounted.current) setUser(null);
    });
  }, [offlineSession]);

  /**
   * The one-step sign-in.
   *
   * `POST /auth/login` stopped returning a single shape when two-factor landed:
   * it now answers with either a session or a challenge. This helper handles
   * only the first, and says so loudly rather than reading `accessToken` off a
   * challenge — which would store `undefined`, call `/auth/me`, get a 401, and
   * leave the user staring at a login form that appeared to accept them.
   *
   * A caller that needs to support 2FA drives the flow itself: post to
   * `authApi.login`, branch on `requiresTwoFactor`, then `tokenStore.set` and
   * `reload()`. The admin login page is the worked example.
   */
  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);

    if ('requiresTwoFactor' in result) {
      throw new Error(
        'This account has two-factor authentication enabled, and this screen cannot complete ' +
          'that sign-in. Use the main panel to sign in.',
      );
    }

    tokenStore.set({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    // /auth/me rather than the login payload: it carries branch and status,
    // which the navigation needs and login does not return.
    const profile = await authApi.me();
    offlineSession?.save(profile);
    setUser(profile);
  }, [offlineSession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // A failed logout call must not strand the user in a signed-in shell.
      // Clearing locally is the part that matters to them.
    } finally {
      tokenStore.clear();
      offlineSession?.save(null);
      setUser(null);
    }
  }, [offlineSession]);

  const reload = useCallback(async () => {
    const profile = await authApi.me();
    offlineSession?.save(profile);
    setUser(profile);
  }, [offlineSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initialising, login, logout, reload }),
    [user, initialising, login, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
