import type { AxiosInstance } from 'axios';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi, storefrontCategoriesApi } from '../api/categories';
import { queryKeys } from '../api/queryKeys';
import type { CreateCategoryInput, UpdateCategoryInput } from '../api/types';

export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.categories.list(includeInactive),
    queryFn: () => categoriesApi.list(includeInactive),
    placeholderData: keepPreviousData,
  });
}

export function useCategory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.categories.detail(id ?? ''),
    queryFn: () => categoriesApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => categoriesApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      categoriesApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}

export function useSetCategoryActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      categoriesApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => categoriesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });
}

/**
 * Active categories, nested two levels deep, no auth required. `client`
 * should be the caller's own axios instance - see storefrontCategoriesApi's
 * doc comment for why the customer app must pass its own.
 */
export function useStorefrontCategoryTree(client?: AxiosInstance) {
  return useQuery({
    queryKey: queryKeys.categories.storefront(),
    queryFn: () => storefrontCategoriesApi.tree(client),
    staleTime: 60_000,
  });
}
