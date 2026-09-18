import type { AxiosInstance } from 'axios';
import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';
import type { Category, CategoryTreeNode, CreateCategoryInput, UpdateCategoryInput } from './types';

export const categoriesApi = {
  async list(includeInactive?: boolean): Promise<Paginated<Category>> {
    const response = await api.get<Category[]>('/categories', {
      params: includeInactive ? { includeInactive: true } : undefined,
    });
    return unwrapList<Category>(response.data);
  },

  async get(id: string): Promise<Category> {
    const response = await api.get<Category>(`/categories/${id}`);
    return unwrap<Category>(response.data);
  },

  async create(input: CreateCategoryInput): Promise<Category> {
    const response = await api.post<Category>('/categories', pruneEmpty(input));
    return unwrap<Category>(response.data);
  },

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const response = await api.patch<Category>(`/categories/${id}`, pruneEmpty(input));
    return unwrap<Category>(response.data);
  },

  async setActive(id: string, isActive: boolean): Promise<Category> {
    const response = await api.patch<Category>(`/categories/${id}/active`, { isActive });
    return unwrap<Category>(response.data);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/categories/${id}`);
  },
};

/**
 * Deliberately unguarded on the server - same reasoning as storefrontBannersApi.
 * Takes the caller's own axios instance for the same reason: the customer app
 * runs a separate client from the staff panel's `@shared/api/client`.
 */
export const storefrontCategoriesApi = {
  async tree(client: AxiosInstance = api): Promise<CategoryTreeNode[]> {
    const response = await client.get<CategoryTreeNode[]>('/storefront/categories');
    return unwrapList<CategoryTreeNode>(response.data).data;
  },
};
