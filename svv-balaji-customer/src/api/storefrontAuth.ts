import { api } from './client';
import type {
  ReferralCheckResponse,
  RegisterRetailerPayload,
  RegisterRetailerResponse,
  RequestOtpResponse,
  StorefrontAccountSummary,
  UpdateStorefrontProfilePayload,
  VerifyOtpResponse,
} from './types';

export const storefrontAuthApi = {
  requestOtp(phone: string) {
    return api
      .post<RequestOtpResponse>('/storefront/auth/otp/request', { phone })
      .then((r) => r.data);
  },

  verifyOtp(phone: string, code: string, fullName?: string, referralCode?: string) {
    return api
      .post<VerifyOtpResponse>('/storefront/auth/otp/verify', { phone, code, fullName, referralCode })
      .then((r) => r.data);
  },

  /** Live feedback on a code before submitting it — creates nothing. */
  checkReferralCode(code: string, phone: string) {
    return api
      .get<ReferralCheckResponse>('/storefront/auth/referral/check', { params: { code, phone } })
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

  logout() {
    return api.post('/storefront/auth/logout').then((r) => r.data);
  },
};
