import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  CreateUserInput,
  StaffUser,
  UpdateUserInput,
  UserStatus,
} from './types';

export const usersApi = {
  async list(filters: { branchId?: string; status?: UserStatus } = {}): Promise<
    Paginated<StaffUser>
  > {
    const response = await api.get<StaffUser[]>('/users', { params: pruneEmpty(filters) });
    return unwrapList<StaffUser>(response.data);
  },

  async get(id: string): Promise<StaffUser> {
    const response = await api.get<StaffUser>(`/users/${id}`);
    return unwrap<StaffUser>(response.data);
  },

  async create(input: CreateUserInput): Promise<StaffUser> {
    const response = await api.post<StaffUser>('/users', pruneEmpty(input));
    return unwrap<StaffUser>(response.data);
  },

  async update(id: string, input: UpdateUserInput): Promise<StaffUser> {
    const response = await api.patch<StaffUser>(`/users/${id}`, pruneEmpty(input));
    return unwrap<StaffUser>(response.data);
  },

  /**
   * Deactivating clears the user's refresh token server-side, so a session they
   * currently hold stops working rather than surviving until it expires. That
   * is the difference between "they cannot sign in again" and "they cannot use
   * the system", and for someone who has just left it is the one that matters.
   */
  async setStatus(id: string, status: UserStatus): Promise<StaffUser> {
    const response = await api.patch<StaffUser>(`/users/${id}/status`, { status });
    return unwrap<StaffUser>(response.data);
  },

  async resetPassword(id: string, password: string): Promise<void> {
    await api.patch(`/users/${id}/password`, { password });
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },
};
