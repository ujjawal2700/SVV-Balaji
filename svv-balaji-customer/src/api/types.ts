/**
 * Shapes returned by `/storefront/auth/*` — the storefront's own identity
 * surface (CustomerAccount), separate from the staff API in `shared/`. See
 * svv-balaji-backend/src/storefront/storefront-auth.service.ts for the source
 * of truth.
 */

export type StorefrontChannel = 'B2C' | 'B2B';

export type StorefrontAccountStatus =
  | 'PENDING_VERIFICATION'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED';

export interface RequestOtpResponse {
  phone: string;
  purpose: 'LOGIN' | 'REGISTRATION';
  ttlSeconds: number;
  mode: 'mock' | 'sms';
  /** Only present in mock mode — no SMS vendor procured yet (A-11-shaped gap). */
  devCode?: string;
}

export interface StorefrontAccountSummary {
  id: string;
  phone: string;
  fullName: string;
  email?: string | null;
  channel: StorefrontChannel;
  status: StorefrontAccountStatus;
  customerId?: string | null;
  customer?: { id: string; customerCode: string; status?: string } | null;
  businessName?: string | null;
  gstin?: string | null;
  /** This account's own shareable refer-a-friend code. Null until it has a Customer row. */
  referralCode?: string | null;
}

export interface StorefrontSession {
  accessToken: string;
  refreshToken: string;
  account: StorefrontAccountSummary;
}

/** Returned instead of a session when a retailer's registration is still under review. */
export interface StorefrontPending {
  pending: true;
  status: StorefrontAccountStatus;
  message: string;
}

export type VerifyOtpResponse = StorefrontSession | StorefrontPending;

export function isStorefrontSession(
  response: VerifyOtpResponse,
): response is StorefrontSession {
  return 'accessToken' in response;
}

export interface RegisterRetailerPayload {
  phone: string;
  fullName: string;
  businessName: string;
  email?: string;
  gstin: string;
  pan?: string;
  addressLine: string;
  city: string;
  district?: string;
  state: string;
  pincode: string;
  code: string;
  /** Another customer's referral code. Validated at submission and again on approval. */
  referralCode?: string;
}

export interface RegisterRetailerResponse {
  status: StorefrontAccountStatus;
  message: string;
}

export interface UpdateStorefrontProfilePayload {
  fullName?: string;
  email?: string;
}

export interface ReferralCheckResponse {
  valid: true;
  referrerName: string;
}
