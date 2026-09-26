import type { AxiosInstance } from 'axios';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { homeSectionsApi, storefrontHomeSectionsApi } from '../api/home-sections';
import { queryKeys } from '../api/queryKeys';
import type { BannerAudience, CreateHomeSectionInput, UpdateHomeSectionInput } from '../api/types';

export function useHomeSections(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.homeSections.list(includeInactive),
    queryFn: () => homeSectionsApi.list(includeInactive),
    placeholderData: keepPreviousData,
  });
}

export function useHomeSection(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.homeSections.detail(id ?? ''),
    queryFn: () => homeSectionsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateHomeSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHomeSectionInput) => homeSectionsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.homeSections.all });
    },
  });
}

export function useUpdateHomeSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateHomeSectionInput }) =>
      homeSectionsApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.homeSections.all });
    },
  });
}

export function useSetHomeSectionActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      homeSectionsApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.homeSections.all });
    },
  });
}

export function useDeleteHomeSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => homeSectionsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.homeSections.all });
    },
  });
}

export function useStorefrontHomeSections(audience?: BannerAudience, client?: AxiosInstance) {
  return useQuery({
    queryKey: queryKeys.homeSections.storefront(audience),
    queryFn: () => storefrontHomeSectionsApi.list(audience, client),
  });
}
