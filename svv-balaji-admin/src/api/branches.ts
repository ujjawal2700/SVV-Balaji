import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type { Branch, CreateBranchInput } from './types';

export const branchesApi = {
  async list(): Promise<Paginated<Branch>> {
    const response = await api.get<Branch[]>('/branches');
    return unwrapList<Branch>(response.data);
  },

  async get(id: string): Promise<Branch> {
    const response = await api.get<Branch>(`/branches/${id}`);
    return unwrap<Branch>(response.data);
  },

  async create(input: CreateBranchInput): Promise<Branch> {
    const response = await api.post<Branch>('/branches', pruneEmpty(input));
    return unwrap<Branch>(response.data);
  },
};
