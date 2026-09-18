import type { AxiosInstance } from 'axios';
import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type { BannerAudience, CreateSchemeInput, Scheme, UpdateSchemeInput } from './types';

/** Admin CMS - staff-only, behind the schemes.* permissions. */
export const schemesApi = {
  async list(includeInactive?: boolean): Promise<Paginated<Scheme>> {
    const response = await api.get<Scheme[]>('/schemes', {
      params: includeInactive ? { includeInactive: true } : undefined,
    });
    return unwrapList<Scheme>(response.data);
  },

  async get(id: string): Promise<Scheme> {
    const response = await api.get<Scheme>(`/schemes/${id}`);
    return unwrap<Scheme>(response.data);
  },

  async create(input: CreateSchemeInput): Promise<Scheme> {
    const response = await api.post<Scheme>('/schemes', pruneEmpty(input));
    return unwrap<Scheme>(response.data);
  },

  async update(id: string, input: UpdateSchemeInput): Promise<Scheme> {
    const response = await api.patch<Scheme>(`/schemes/${id}`, pruneEmpty(input));
    return unwrap<Scheme>(response.data);
  },

  async setActive(id: string, isActive: boolean): Promise<Scheme> {
    const response = await api.patch<Scheme>(`/schemes/${id}/active`, { isActive });
    return unwrap<Scheme>(response.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/schemes/${id}`);
  },
};

/**
 * Deliberately unguarded on the server - same reasoning as storefrontBannersApi.
 * Takes the caller's own axios instance for the same reason (see that doc
 * comment): the customer app runs a separate client from the staff panel's.
 *
 * An empty result is a deliberate "Super Admin hid the section" state, not a
 * loading gap - callers should render nothing, not fall back to placeholder
 * content, when this resolves empty.
 */
export const storefrontSchemesApi = {
  async list(audience?: BannerAudience, client: AxiosInstance = api): Promise<Scheme[]> {
    const response = await client.get<Scheme[]>('/storefront/schemes', {
      params: audience ? { audience } : undefined,
    });
    return unwrapList<Scheme>(response.data).data;
  },
};
