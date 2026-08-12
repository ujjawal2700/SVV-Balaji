import { useCallback } from 'react';
import { PERMISSIONS, type Permission } from './permissions';
import { hasRole } from './types';
import { useAuth } from './useAuth';

/**
 * Whether the signed-in user may perform a given action.
 *
 *   const canApprove = useCan('FARMER_APPROVE');
 *
 * Use this to decide whether to render an action at all - never to decide
 * whether to *send* a request that the server would refuse. The server is the
 * authority; this only spares the user a button that cannot work.
 */
export function useCan(permission: Permission): boolean {
  const { user } = useAuth();
  return hasRole(user?.role, PERMISSIONS[permission]);
}

/** Checks several permissions without one hook call per action. */
export function useCanFn(): (permission: Permission) => boolean {
  const { user } = useAuth();
  return useCallback(
    (permission: Permission) => hasRole(user?.role, PERMISSIONS[permission]),
    [user?.role],
  );
}
