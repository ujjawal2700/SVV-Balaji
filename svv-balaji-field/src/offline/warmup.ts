import type { QueryClient } from '@tanstack/react-query';
import { agreementsApi } from '@shared/api/agreements';
import { branchesApi } from '@shared/api/branches';
import { farmersApi } from '@shared/api/farmers';
import { fieldVisitPlansApi } from '@shared/api/fieldVisitPlans';
import { fieldVisitsApi } from '@shared/api/fieldVisits';
import { queryKeys } from '@shared/api/queryKeys';
import { seedDistributionApi } from '@shared/api/seedDistribution';
import { seedStockApi } from '@shared/api/seedStock';
import { trainingApi } from '@shared/api/training';
import type { AuthUser } from '@shared/auth/types';

/**
 * Gets the device ready for a dead zone while it still has signal.
 *
 * 1. Loads the code for every screen, so the service worker has cached it: a
 *    tab opened for the first time with no signal would otherwise fail to load.
 * 2. Loads the data the screens and forms read, under the SAME query keys the
 *    screens use, so it lands in the persisted cache (persist.ts).
 *
 * Best effort and quiet - anything the user may not see (a 403) is skipped.
 */
const SCREENS = [
  () => import('../pages/HomePage'),
  () => import('../pages/FarmersTab'),
  () => import('../pages/VisitsTab'),
  () => import('../pages/SeedTab'),
  () => import('../pages/MoreTab'),
  () => import('../pages/TrainingTab'),
  () => import('../pages/SyncPage'),
];

export function warmUp(client: QueryClient, user: AuthUser) {
  if (!navigator.onLine) return;
  const can = (key: string) => user.role === 'SUPER_ADMIN' || (user.permissions ?? []).includes(key);
  const prefetch = (queryKey: readonly unknown[], queryFn: () => Promise<unknown>) =>
    client.prefetchQuery({ queryKey, queryFn, staleTime: 60_000 }).catch(() => undefined);

  for (const load of SCREENS) void load().catch(() => undefined);

  void prefetch(queryKeys.branches.list(true), () => branchesApi.list(true));
  if (can('farmers.view')) void prefetch(queryKeys.farmers.list({}), () => farmersApi.list({}));
  if (can('agreements.view')) void prefetch(queryKeys.agreements.list(undefined), () => agreementsApi.list(undefined));
  if (can('fieldVisits.view')) {
    void prefetch(queryKeys.fieldVisits.list({}), () => fieldVisitsApi.list({}));
    void prefetch(queryKeys.fieldVisits.list({ expertId: user.id }), () => fieldVisitsApi.list({ expertId: user.id }));
    void prefetch(queryKeys.fieldVisitPlans.list({ status: 'PLANNED' }), () => fieldVisitPlansApi.list({ status: 'PLANNED' }));
    void prefetch(queryKeys.fieldVisitPlans.list({ status: 'PLANNED', expertId: user.id }), () =>
      fieldVisitPlansApi.list({ status: 'PLANNED', expertId: user.id }),
    );
  }
  if (can('seed.view')) {
    void prefetch(queryKeys.seedDistribution.list({}), () => seedDistributionApi.list({}));
    void prefetch(queryKeys.seedDistribution.list({ distributedById: user.id }), () =>
      seedDistributionApi.list({ distributedById: user.id }),
    );
  }
  if (can('seedStock.view')) {
    void prefetch(queryKeys.seedStock.list({}), () => seedStockApi.list({}));
    if (user.branchId) {
      // The exact key the handout form's lot picker reads for this branch.
      void prefetch(queryKeys.seedStock.list({ branchId: user.branchId, availableOnly: true }), () =>
        seedStockApi.list({ branchId: user.branchId as string, availableOnly: true }),
      );
    }
  }
  if (can('training.view')) void prefetch(queryKeys.training.list({}), () => trainingApi.list({}));
}
