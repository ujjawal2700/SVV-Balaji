import type { AxiosInstance } from 'axios';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bannersApi, storefrontBannersApi } from '../api/banners';
import { queryKeys } from '../api/queryKeys';
import type { BannerAudience, BannerPlacement, CreateBannerInput, UpdateBannerInput } from '../api/types';

export function useBanners(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.banners.list(includeInactive),
    queryFn: () => bannersApi.list(includeInactive),
    placeholderData: keepPreviousData,
  });
}

export function useBanner(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.banners.detail(id ?? ''),
    queryFn: () => bannersApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBannerInput) => bannersApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.banners.all });
    },
  });
}

export function useUpdateBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBannerInput }) =>
      bannersApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.banners.all });
    },
  });
}

export function useSetBannerActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      bannersApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.banners.all });
    },
  });
}

export function useDeleteBanner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => bannersApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.banners.all });
    },
  });
}

/**
 * Active banners for one storefront slot, no auth required.
 *
 * `client` should be the caller's own axios instance - the customer app runs
 * a separate one from the staff panel's `@shared/api/client` (see
 * storefrontBannersApi's doc comment).
 */
export function useStorefrontBanners(
  placement: BannerPlacement,
  audience?: BannerAudience,
  client?: AxiosInstance,
) {
  return useQuery({
    queryKey: queryKeys.banners.storefront(placement, audience),
    queryFn: () => storefrontBannersApi.list(placement, audience, client),
    staleTime: 60_000,
  });
}
