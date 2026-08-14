import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { permissionsApi } from '../api/permissions';
import { queryKeys } from '../api/queryKeys';
import type { UserRole } from '../auth/types';
import { useAuth } from '../auth/useAuth';

/**
 * The catalogue of what can be granted. Effectively static for the lifetime of
 * a deployment - it changes when the application ships new screens, not when
 * an administrator ticks a box - so it is cached hard.
 */
export function usePermissionRegistry() {
  return useQuery({
    queryKey: queryKeys.permissions.registry(),
    queryFn: () => permissionsApi.registry(),
    staleTime: Infinity,
  });
}

/** What each role currently holds, plus how many people that affects. */
export function usePermissionMatrix() {
  return useQuery({
    queryKey: queryKeys.permissions.matrix(),
    queryFn: () => permissionsApi.matrix(),
  });
}

/**
 * Saves a role's permissions.
 *
 * Reloads the signed-in user afterwards, always - not only when they edited
 * their own role. A Super Admin editing Sales Team does not change their own
 * access, but the reload costs one request and removes a whole class of
 * confusion where the sidebar disagrees with what was just saved.
 */
export function useSetRolePermissions() {
  const queryClient = useQueryClient();
  const { reload } = useAuth();

  return useMutation({
    mutationFn: ({ role, permissions }: { role: UserRole; permissions: string[] }) =>
      permissionsApi.setForRole(role, permissions),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.permissions.all });
      await reload();
    },
  });
}

export function useResetRolePermissions() {
  const queryClient = useQueryClient();
  const { reload } = useAuth();

  return useMutation({
    mutationFn: (role: UserRole) => permissionsApi.resetRole(role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.permissions.all });
      await reload();
    },
  });
}
