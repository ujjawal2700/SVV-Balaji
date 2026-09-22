import { api } from './client';
import type {
  CustomerReferralSummaryResponse,
  ReferralCheckResponse,
  ReferralProgramResponse,
  RegisterRetailerPayload,
  RegisterRetailerResponse,
  RequestOtpResponse,
  StorefrontAccountSummary,
  UpdateStorefrontProfilePayload,
  VerifyOtpResponse,
} from './types';

/** Which sign-in screen the request comes from. The server refuses the other audience's numbers. */
export type AuthAudience = 'CUSTOMER' | 'RETAILER';

export const storefrontAuthApi = {
  requestOtp(phone: string, audience?: AuthAudience) {
    return api
      .post<RequestOtpResponse>('/storefront/auth/otp/request', { phone, audience })
      .then((r) => r.data);
  },

  verifyOtp(phone: string, code: string, audience: AuthAudience, fullName?: string, referralCode?: string) {
    return api
      .post<VerifyOtpResponse>('/storefront/auth/otp/verify', { phone, code, audience, fullName, referralCode })
      .then((r) => r.data);
  },

  /** Live feedback on a code before submitting it — creates nothing. */
  checkReferralCode(code: string, phone: string) {
    return api
      .get<ReferralCheckResponse>('/storefront/auth/referral/check', { params: { code, phone } })
      .then((r) => r.data);
  },

  /** Active referral program rules & coins. */
  getReferralProgram() {
    return api
      .get<ReferralProgramResponse>('/storefront/auth/referral/program')
      .then((r) => r.data);
  },

  /** Customer's own referral code, statistics and referral history. */
  getMyReferralSummary() {
    return api
      .get<CustomerReferralSummaryResponse>('/storefront/auth/referral/my-summary')
      .then((r) => r.data);
  },

  registerRetailer(payload: RegisterRetailerPayload) {
    return api
      .post<RegisterRetailerResponse>('/storefront/auth/register-retailer', payload)
      .then((r) => r.data);
  },

  refresh(refreshToken: string) {
    return api
      .post<VerifyOtpResponse>('/storefront/auth/refresh', { refreshToken })
      .then((r) => r.data);
  },

  me() {
    return api.get<StorefrontAccountSummary>('/storefront/auth/me').then((r) => r.data);
  },

  updateProfile(dto: UpdateStorefrontProfilePayload) {
    return api
      .patch<StorefrontAccountSummary>('/storefront/auth/profile', dto)
      .then((r) => r.data);
  },

  /** Tokens are passed explicitly: the caller clears the local store right after, before the request interceptor would read it. */
  logout(tokens: { accessToken?: string | null; refreshToken?: string | null }) {
    return api
      .post(
        '/storefront/auth/logout',
        { refreshToken: tokens.refreshToken ?? undefined },
        tokens.accessToken ? { headers: { Authorization: `Bearer ${tokens.accessToken}` } } : undefined,
      )
      .then((r) => r.data);
  },
};
