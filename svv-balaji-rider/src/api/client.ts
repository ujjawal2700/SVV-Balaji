import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Rider session tokens. Access token in memory only; refresh token in
 * localStorage under a key of its own (never shared with the staff or
 * customer apps, which may run on the same origin).
 */
const REFRESH_KEY = 'svv.rider.refreshToken';
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;

export const tokens = {
  get access() {
    return accessToken;
  },
  get refresh() {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  set(access: string, refresh: string) {
    accessToken = access;
    try {
      localStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      /* private mode: session lasts until the tab closes */
    }
  },
  clear() {
    accessToken = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
  onLost(fn: () => void) {
    onSessionLost = fn;
  },
};

export const api = axios.create({ baseURL: `${import.meta.env.VITE_API_BASE ?? ''}/api/v1`, timeout: 20_000 });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.set('Authorization', `Bearer ${accessToken}`);
  return cfg;
});

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; every request that hit a 401 waits for the same one. */
export function refreshSession(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return Promise.resolve(false);
  refreshing ??= axios
    .post(`${api.defaults.baseURL}/rider/auth/refresh`, { refreshToken: refresh })
    .then((r) => {
      tokens.set(r.data.accessToken, r.data.refreshToken);
      return true;
    })
    .catch((e: AxiosError) => {
      // Only a definite "no" ends the session; a network blip keeps it.
      if (e.response && e.response.status < 500) tokens.clear();
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const cfg = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  const isAuthCall = cfg?.url?.includes('/rider/auth/');
  if (error.response?.status === 401 && cfg && !cfg._retried && !isAuthCall) {
    cfg._retried = true;
    if (await refreshSession()) return api(cfg);
    onSessionLost?.();
  }
  throw error;
});

/** The server's message for a failed request, or a sensible fallback. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  const ax = e as AxiosError<{ message?: string | string[] }>;
  if (ax?.response?.data?.message) {
    const m = ax.response.data.message;
    return Array.isArray(m) ? m[0] : m;
  }
  if (ax?.code === 'ERR_NETWORK' || ax?.message === 'Network Error') return 'No connection. Check your internet and try again.';
  return fallback;
}

export function errorCode(e: unknown): string | undefined {
  return (e as AxiosError<{ code?: string }>)?.response?.data?.code;
}
