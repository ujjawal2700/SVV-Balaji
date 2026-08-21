import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  Branch,
  BranchPerformance,
  BranchPerformanceQuery,
  CreateBranchInput,
  UpdateBranchInput,
} from './types';

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

  /** FRD 6.2 — assign, or vacate with null. */
  async assignManager(id: string, managerId: string | null): Promise<Branch> {
    const response = await api.patch<Branch>(`/branches/${id}/manager`, { managerId });
    return unwrap<Branch>(response.data);
  },

  /** FRD 6.4/6.5 — one branch over a period. */
  async performance(id: string, query: BranchPerformanceQuery = {}): Promise<BranchPerformance> {
    const response = await api.get<BranchPerformance>(`/branches/${id}/performance`, {
      params: pruneEmpty(query),
    });
    return unwrap<BranchPerformance>(response.data);
  },

  /**
   * FRD 6.5 — every branch side by side.
   *
   * A branch-scoped user gets their own branch back as a one-element list
   * rather than a refusal, so the comparison screen works for them too — it
   * just has nothing to compare against.
   */
  async consolidated(query: BranchPerformanceQuery = {}): Promise<BranchPerformance[]> {
    const response = await api.get<BranchPerformance[]>('/branches/performance', {
      params: pruneEmpty(query),
    });
    return unwrapList<BranchPerformance>(response.data).data;
  },
};
