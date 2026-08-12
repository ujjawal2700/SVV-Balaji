import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import type { CreateUserInput } from '../api/types';
import { usersApi } from '../api/users';

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: () => usersApi.list(),
    // GET /users is Super Admin / Branch Manager only. Other roles land on the
    // page via a stale link; running the query anyway would just produce a 403
    // toast, so callers pass `enabled: false` instead.
    enabled,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
