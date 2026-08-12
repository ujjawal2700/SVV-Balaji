import { api } from './client';
import type { AuthUser, SessionResponse } from '../auth/types';

export const authApi = {
  login(email: string, password: string) {
    return api.post<SessionResponse>('/auth/login', { email, password }).then((r) => r.data);
  },

  me() {
    return api.get<AuthUser>('/auth/me').then((r) => r.data);
  },

  logout() {
    return api.post<{ success: boolean }>('/auth/logout').then((r) => r.data);
  },
};
