import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { config } from '../config';
import { tokenStore } from './tokenStore';
import type { SessionResponse } from '../auth/types';

/** Routes that must never trigger the refresh interceptor. */
const AUTH_ROUTES = ['/auth/login', '/auth/refresh'];

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

export const api: AxiosInstance = axios.create({
  baseURL: config.apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((request) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    request.headers.Authorization = `Bearer ${token}`;
  }
  return request;
});

/**
 * In-flight refresh, shared by every request that hits a 401 at the same time.
 *
 * This is not an optimisation - it is required. The backend ROTATES refresh
 * tokens and treats a replayed one as theft, ending the session outright. If
 * three requests each fired their own refresh with the same token, two would be
 * replays and the user would be logged out. So: one refresh, everyone waits.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshSession(): Promise<string> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  // Deliberately a bare axios call, not `api` - going through the instrumented
  // instance would let a failing refresh recurse into itself.
  const response = await axios.post<SessionResponse>(
    `${config.apiBaseUrl}/auth/refresh`,
    { refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );

  tokenStore.set({
    accessToken: response.data.accessToken,
    refreshToken: response.data.refreshToken,
  });

  return response.data.accessToken;
}

export function refreshOnce(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    const isAuthRoute = AUTH_ROUTES.some((route) => original?.url?.includes(route));

    if (status !== 401 || !original || original._retried || isAuthRoute) {
      return Promise.reject(error);
    }

    if (!tokenStore.getRefreshToken()) {
      tokenStore.clear();
      tokenStore.notifySessionLost();
      return Promise.reject(error);
    }

    try {
      const token = await refreshOnce();
      original._retried = true;
      original.headers.Authorization = `Bearer ${token}`;
      return api.request(original);
    } catch {
      // Refresh failed: the token was expired, revoked, or already rotated
      // away. Nothing left to try - hand control back to the app.
      tokenStore.clear();
      tokenStore.notifySessionLost();
      return Promise.reject(error);
    }
  },
);

/**
 * Pulls a readable message out of a Nest error response.
 *
 * The backend puts real explanations in `message` - "Order of 12000.00 would
 * take CUST-B2B-000004 to 58000.00 against a credit limit of 50000.00" is
 * worth showing the user verbatim, so this keeps it rather than replacing it
 * with something generic.
 */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join('. ');
    if (typeof data?.message === 'string') return data.message;
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
