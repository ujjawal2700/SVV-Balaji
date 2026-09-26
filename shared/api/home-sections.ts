import type { AxiosInstance } from 'axios';
import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type {
  BannerAudience,
  CreateHomeSectionInput,
  HomeSection,
  StorefrontHomeSection,
  UpdateHomeSectionInput,
} from './types';

/** Admin CMS - staff-only, behind homeSections.* permissions. */
export const homeSectionsApi = {
  async list(includeInactive?: boolean): Promise<Paginated<HomeSection>> {
    const response = await api.get<HomeSection[]>('/home-sections', {
      params: includeInactive ? { includeInactive: true } : undefined,
    });
    return unwrapList<HomeSection>(response.data);
  },

  async get(id: string): Promise<HomeSection> {
    const response = await api.get<HomeSection>(`/home-sections/${id}`);
    return unwrap<HomeSection>(response.data);
  },

  async create(input: CreateHomeSectionInput): Promise<HomeSection> {
    const response = await api.post<HomeSection>('/home-sections', pruneEmpty(input));
    return unwrap<HomeSection>(response.data);
  },

  async update(id: string, input: UpdateHomeSectionInput): Promise<HomeSection> {
    const response = await api.patch<HomeSection>(`/home-sections/${id}`, pruneEmpty(input));
    return unwrap<HomeSection>(response.data);
  },

  async setActive(id: string, isActive: boolean): Promise<HomeSection> {
    const response = await api.patch<HomeSection>(`/home-sections/${id}/active`, { isActive });
    return unwrap<HomeSection>(response.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/home-sections/${id}`);
  },
};

/**
 * Public storefront endpoint for customer home page sections.
 */
export const storefrontHomeSectionsApi = {
  async list(audience?: BannerAudience, client: AxiosInstance = api): Promise<StorefrontHomeSection[]> {
    const response = await client.get<StorefrontHomeSection[]>('/storefront/home-sections', {
      params: audience ? { audience } : undefined,
    });
    return unwrapList<StorefrontHomeSection>(response.data).data;
  },
};
