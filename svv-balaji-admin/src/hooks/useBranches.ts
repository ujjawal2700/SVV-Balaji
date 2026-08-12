import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchesApi } from '../api/branches';
import { queryKeys } from '../api/queryKeys';
import type { CreateBranchInput } from '../api/types';

export function useBranches() {
  return useQuery({
    queryKey: queryKeys.branches.list(),
    queryFn: () => branchesApi.list(),
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
