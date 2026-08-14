import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type { Branch, CreateBranchInput, UpdateBranchInput } from './types';

export const branchesApi = {
  /**
   * `activeOnly` is what the pickers pass. The branch master screen omits it,
   * because a deactivated branch has to stay visible on the one screen able to
   * bring it back.
   */
  async list(activeOnly?: boolean): Promise<Paginated<Branch>> {
    const response = await api.get<Branch[]>('/branches', {
      params: activeOnly ? { activeOnly: true } : undefined,
    });
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

  async update(id: string, input: UpdateBranchInput): Promise<Branch> {
    const response = await api.patch<Branch>(`/branches/${id}`, pruneEmpty(input));
    return unwrap<Branch>(response.data);
  },

  async setActive(id: string, isActive: boolean): Promise<Branch> {
    const response = await api.patch<Branch>(`/branches/${id}/active`, { isActive });
    return unwrap<Branch>(response.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/branches/${id}`);
  },
};
