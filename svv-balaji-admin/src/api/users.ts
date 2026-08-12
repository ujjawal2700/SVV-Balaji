import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type { CreateUserInput, StaffUser } from './types';

export const usersApi = {
  async list(): Promise<Paginated<StaffUser>> {
    const response = await api.get<StaffUser[]>('/users');
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
};
