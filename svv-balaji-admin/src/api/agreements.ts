import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type { Agreement, AgreementStatus, CreateAgreementInput } from './types';

export const agreementsApi = {
  /** The endpoint accepts only `farmerId` — nothing else is whitelisted. */
  async list(farmerId?: string): Promise<Paginated<Agreement>> {
    const response = await api.get<Agreement[]>('/agreements', {
      params: pruneEmpty({ farmerId }),
    });
    return unwrapList<Agreement>(response.data);
  },

  async get(id: string): Promise<Agreement> {
    const response = await api.get<Agreement>(`/agreements/${id}`);
    return unwrap<Agreement>(response.data);
  },

  async create(input: CreateAgreementInput): Promise<Agreement> {
    const response = await api.post<Agreement>('/agreements', pruneEmpty(input));
    return unwrap<Agreement>(response.data);
  },

  async setStatus(id: string, status: AgreementStatus): Promise<Agreement> {
    const response = await api.patch<Agreement>(`/agreements/${id}/status`, { status });
    return unwrap<Agreement>(response.data);
  },
};
