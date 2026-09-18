import type { AxiosInstance } from 'axios';
import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  Banner,
  BannerAudience,
  BannerPlacement,
  CreateBannerInput,
  UpdateBannerInput,
} from './types';

/** Admin CMS - staff-only, behind the banners.* permissions. */
export const bannersApi = {
  async list(includeInactive?: boolean): Promise<Paginated<Banner>> {
    const response = await api.get<Banner[]>('/banners', {
      params: includeInactive ? { includeInactive: true } : undefined,
    });
    return unwrapList<Banner>(response.data);
  },

  async get(id: string): Promise<Banner> {
    const response = await api.get<Banner>(`/banners/${id}`);
    return unwrap<Banner>(response.data);
  },

  async create(input: CreateBannerInput): Promise<Banner> {
    const response = await api.post<Banner>('/banners', pruneEmpty(input));
    return unwrap<Banner>(response.data);
  },

  async update(id: string, input: UpdateBannerInput): Promise<Banner> {
    const response = await api.patch<Banner>(`/banners/${id}`, pruneEmpty(input));
    return unwrap<Banner>(response.data);
  },

  async setActive(id: string, isActive: boolean): Promise<Banner> {
    const response = await api.patch<Banner>(`/banners/${id}/active`, { isActive });
    return unwrap<Banner>(response.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/banners/${id}`);
  },
};

/**
 * Deliberately unguarded on the server - the same reasoning as the storefront
 * catalogue. Safe to call before a shopper signs in.
 *
 * Takes the caller's own axios instance, defaulting to the staff panel's
 * `api`: the customer app runs a separate axios client bound to
 * `/storefront/auth/*` refresh handling (see svv-balaji-customer/src/api/client.ts)
 * and must pass that one in instead.
 */
export const storefrontBannersApi = {
  async list(
    placement: BannerPlacement,
    audience?: BannerAudience,
    client: AxiosInstance = api,
  ): Promise<Banner[]> {
    const response = await client.get<Banner[]>('/storefront/banners', {
      params: { placement, ...(audience ? { audience } : {}) },
    });
    return unwrapList<Banner>(response.data).data;
  },
};
