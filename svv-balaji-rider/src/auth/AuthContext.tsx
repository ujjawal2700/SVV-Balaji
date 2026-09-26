import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { refreshSession, tokens } from '../api/client';
import { riderApi, type Rider, type Session } from '../api/rider';

interface AuthValue {
  rider: Rider | null;
  initialising: boolean;
  signIn: (s: Session) => void;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [initialising, setInitialising] = useState(true);

  const reload = useCallback(async () => {
    setRider(await riderApi.me());
  }, []);

  useEffect(() => {
    tokens.onLost(() => setRider(null));
    (async () => {
      try {
        if (tokens.refresh && (await refreshSession())) await reload();
      } catch {
        /* stays signed out */
      } finally {
        setInitialising(false);
      }
    })();
  }, [reload]);

  const signIn = useCallback((s: Session) => {
    tokens.set(s.accessToken, s.refreshToken);
    setRider(s.rider);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await riderApi.logout();
    } catch {
      /* signing out locally is what matters */
    }
    tokens.clear();
    setRider(null);
  }, []);

  const value = useMemo(() => ({ rider, initialising, signIn, signOut, reload }), [rider, initialising, signIn, signOut, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
