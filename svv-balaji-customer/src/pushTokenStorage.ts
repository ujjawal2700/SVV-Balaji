/**
 * Customer-specific because the storefront, admin and field apps share one
 * production origin. A generic key lets signing into one app overwrite the
 * token another app needs to unregister on sign-out.
 */
export const CUSTOMER_PUSH_TOKEN_KEY = "svv.customer.pushToken";

export const customerPushTokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(CUSTOMER_PUSH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  set(value: string | null): void {
    try {
      if (value) localStorage.setItem(CUSTOMER_PUSH_TOKEN_KEY, value);
      else localStorage.removeItem(CUSTOMER_PUSH_TOKEN_KEY);
    } catch {
      // Private/restricted storage may be unavailable. The database row still
      // remains safe because push delivery is gated by the live login session.
    }
  },
};
