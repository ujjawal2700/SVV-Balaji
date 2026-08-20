import { api } from './client';
import type { AuthUser, SessionResponse, LoginResult } from '../auth/types';

export const authApi = {
  login(email: string, password: string) {
    return api.post<LoginResult>('/auth/login', { email, password }).then((r) => r.data);
  },

  verifyTwoFactorLogin(twoFactorToken: string, code: string) {
    return api.post<SessionResponse>('/auth/2fa/verify-login', { twoFactorToken, code }).then((r) => r.data);
  },

  me() {
    return api.get<AuthUser>('/auth/me').then((r) => r.data);
  },

  logout() {
    return api.post<{ success: boolean }>('/auth/logout').then((r) => r.data);
  },

  updateProfile(data: { fullName: string; phone: string | null; email: string }) {
    return api.patch<AuthUser>('/auth/profile', data).then((r) => r.data);
  },

  changePassword(data: any) {
    return api.post<{ success: boolean }>('/auth/change-password', data).then((r) => r.data);
  },

  generateTwoFactor() {
    return api.post<{ secret: string; qrCodeDataUrl: string }>('/auth/2fa/generate').then((r) => r.data);
  },

  enableTwoFactor(code: string) {
    return api.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code }).then((r) => r.data);
  },

  disableTwoFactor(password: string) {
    return api.post<{ success: boolean }>('/auth/2fa/disable', { password }).then((r) => r.data);
  },
};
