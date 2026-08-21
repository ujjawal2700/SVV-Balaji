import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchesApi } from '../api/branches';
import { queryKeys } from '../api/queryKeys';
import type { BranchPerformanceQuery, CreateBranchInput, UpdateBranchInput } from '../api/types';

/**
 * `activeOnly` is part of the query key, so the picker's active-only list and
 * the master screen's full list cache separately rather than one overwriting
 * the other - which would make a deactivated branch flicker in and out of the
 * dropdown depending on which screen loaded last.
 */
export function useBranches(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.branches.list(activeOnly),
    queryFn: () => branchesApi.list(activeOnly),
    // Branches change rarely and are read by almost every other screen's
    // pickers, so a longer stale window avoids refetching the same six rows.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBranchInput) => branchesApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
    },
  });
}

export function useUpdateBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBranchInput }) =>
      branchesApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
    },
  });
}

export function useSetBranchActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      branchesApi.setActive(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
    },
  });
}

export function useDeleteBranch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => branchesApi.remove(id),
    onSuccess: () => {
      // Deleting a branch can only succeed when nothing referenced it, so
      // nothing else in the cache can be stale as a result.
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
    },
  });
}

/** FRD 6.4/6.5 — one branch's numbers over a period. */
export function useBranchPerformance(id: string | undefined, query: BranchPerformanceQuery = {}) {
  return useQuery({
    queryKey: queryKeys.branches.performance(id ?? '', query),
    queryFn: () => branchesApi.performance(id as string, query),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

/** FRD 6.5 — every branch side by side, for the Super Admin. */
export function useConsolidatedPerformance(query: BranchPerformanceQuery = {}) {
  return useQuery({
    queryKey: queryKeys.branches.consolidated(query),
    queryFn: () => branchesApi.consolidated(query),
    placeholderData: keepPreviousData,
  });
}

/**
 * FRD 6.2 — assign or vacate a branch manager.
 *
 * Invalidates users as well as branches: the assignment is a fact about the
 * user too, and the users screen shows who manages what.
 */
export function useAssignBranchManager() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, managerId }: { id: string; managerId: string | null }) =>
      branchesApi.assignManager(id, managerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
