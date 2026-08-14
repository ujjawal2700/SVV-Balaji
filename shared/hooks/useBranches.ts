import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchesApi } from '../api/branches';
import { queryKeys } from '../api/queryKeys';
import type { CreateBranchInput, UpdateBranchInput } from '../api/types';

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
