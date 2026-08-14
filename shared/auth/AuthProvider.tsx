import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api/auth';
import { refreshOnce } from '../api/client';
import { tokenStore } from '../api/tokenStore';
import type { AuthUser } from './types';

export interface AuthContextValue {
  user: AuthUser | null;
  /** True until the boot-time session restore has settled, either way. */
  initialising: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
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
        if (!cancelled) setUser(profile);
      } catch {
        // Expired, revoked, or rotated away. Not an error worth surfacing -
        // the user simply has to sign in.
        tokenStore.clear();
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
      if (mounted.current) setUser(null);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    tokenStore.set({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    // /auth/me rather than the login payload: it carries branch and status,
    // which the navigation needs and login does not return.
    const profile = await authApi.me();
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // A failed logout call must not strand the user in a signed-in shell.
      // Clearing locally is the part that matters to them.
    } finally {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  const reload = useCallback(async () => {
    const profile = await authApi.me();
    setUser(profile);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, initialising, login, logout, reload }),
    [user, initialising, login, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
