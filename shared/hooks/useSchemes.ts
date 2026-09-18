import type { AxiosInstance } from 'axios';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { schemesApi, storefrontSchemesApi } from '../api/schemes';
import { queryKeys } from '../api/queryKeys';
import type { BannerAudience, CreateSchemeInput, UpdateSchemeInput } from '../api/types';

export function useSchemes(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.schemes.list(includeInactive),
    queryFn: () => schemesApi.list(includeInactive),
    placeholderData: keepPreviousData,
  });
}

export function useScheme(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.schemes.detail(id ?? ''),
    queryFn: () => schemesApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSchemeInput) => schemesApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schemes.all });
    },
  });
}

export function useUpdateScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSchemeInput }) =>
      schemesApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schemes.all });
    },
  });
}

export function useSetSchemeActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      schemesApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schemes.all });
    },
  });
}

export function useDeleteScheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => schemesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schemes.all });
    },
  });
}

/**
 * Active homepage schemes, no auth required. `client` should be the caller's
 * own axios instance (see storefrontSchemesApi's doc comment). An empty
 * result means Super Admin hid the section - callers should render nothing.
 */
export function useStorefrontSchemes(audience?: BannerAudience, client?: AxiosInstance) {
  return useQuery({
    queryKey: queryKeys.schemes.storefront(audience),
    queryFn: () => storefrontSchemesApi.list(audience, client),
    staleTime: 60_000,
  });
}
