import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { config } from '@shared/config';
import { tokenStore } from './tokenStore';
import type { StorefrontSession } from './types';

/**
 * The storefront's own axios instance, bound to `/storefront/auth/*` —
 * separate from `@shared/api/client`, which is the staff panel's client and
 * refreshes against `/auth/refresh` with the staff JWT secret. A customer has
 * no `User` row and no password; sharing that client would mean this app
 * could never actually authenticate anyone.
 */

/** Routes that must never trigger the refresh interceptor. */
const AUTH_ROUTES = [
  '/storefront/auth/otp',
  '/storefront/auth/register-retailer',
  '/storefront/auth/refresh',
  '/storefront/auth/logout',
];

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

/** One in-flight refresh shared by every request that hits a 401 together — see shared/api/client.ts for why this matters (rotating refresh tokens). */
let refreshInFlight: Promise<string> | null = null;

async function refreshSession(): Promise<string> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  const response = await axios.post<StorefrontSession>(
    `${config.apiBaseUrl}/storefront/auth/refresh`,
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
      tokenStore.clear();
      tokenStore.notifySessionLost();
      return Promise.reject(error);
    }
  },
);

/** Pulls a readable message out of a Nest error response. See shared/api/client.ts's twin. */
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
