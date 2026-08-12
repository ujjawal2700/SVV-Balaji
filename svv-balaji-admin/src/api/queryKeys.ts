import type { FarmerQuery } from './types';

/**
 * Every React Query key in the app, in one hierarchy.
 *
 * This exists because ad-hoc key strings are how cache invalidation quietly
 * stops working once there are twenty screens. Keys are built as prefixes, so a
 * mutation can invalidate a whole resource with `queryKeys.farmers.all` without
 * knowing which filter combinations happen to be cached.
 *
 * Rule: no component may write a literal query key. Add it here.
 */
export const queryKeys = {
  branches: {
    all: ['branches'] as const,
    list: () => [...queryKeys.branches.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.branches.all, 'detail', id] as const,
  },

  users: {
    all: ['users'] as const,
    list: () => [...queryKeys.users.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.users.all, 'detail', id] as const,
  },

  farmers: {
    all: ['farmers'] as const,
    // The filter object is part of the key, so each filter combination caches
    // separately and switching back to a previous filter is instant.
    list: (query: FarmerQuery) => [...queryKeys.farmers.all, 'list', query] as const,
    detail: (id: string) => [...queryKeys.farmers.all, 'detail', id] as const,
    codes: (id: string) => [...queryKeys.farmers.all, 'codes', id] as const,
  },

  agreements: {
    all: ['agreements'] as const,
    list: (farmerId?: string) => [...queryKeys.agreements.all, 'list', farmerId ?? null] as const,
    detail: (id: string) => [...queryKeys.agreements.all, 'detail', id] as const,
  },

  seedDistribution: {
    all: ['seed-distribution'] as const,
    list: (farmerId?: string) =>
      [...queryKeys.seedDistribution.all, 'list', farmerId ?? null] as const,
  },

  training: {
    all: ['training-sessions'] as const,
    list: (branchId?: string) => [...queryKeys.training.all, 'list', branchId ?? null] as const,
    detail: (id: string) => [...queryKeys.training.all, 'detail', id] as const,
  },

  fieldVisits: {
    all: ['field-visits'] as const,
    list: (farmerId?: string) => [...queryKeys.fieldVisits.all, 'list', farmerId ?? null] as const,
    detail: (id: string) => [...queryKeys.fieldVisits.all, 'detail', id] as const,
  },
} as const;
