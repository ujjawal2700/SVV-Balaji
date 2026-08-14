import { useCallback, useMemo } from 'react';
import { PERMISSIONS, type Permission } from './permissions';
import { useAuth } from './useAuth';

/**
 * Whether the signed-in user may perform a given action.
 *
 *   const canApprove = useCan('FARMER_APPROVE');
 *
 * The answer comes from the permission list the server returned on /auth/me,
 * not from anything compiled in. When a Super Admin changes what a role may do,
 * this starts returning a different answer as soon as the user's session
 * reloads - which AuthProvider does after a permission change and on every
 * boot.
 *
 * Use it to decide whether to RENDER an action, never whether to send a request
 * the server would refuse. The server is the authority; this only spares the
 * user a button that cannot work.
 */
export function useCan(permission: Permission): boolean {
  const granted = useGrantedPermissions();
  return granted.has(PERMISSIONS[permission]);
}

/** Checks several permissions without one hook call per action. */
export function useCanFn(): (permission: Permission) => boolean {
  const granted = useGrantedPermissions();
  return useCallback((permission: Permission) => granted.has(PERMISSIONS[permission]), [granted]);
}

/** Raw key check, for the permission-matrix screen and the navigation. */
export function useCanKey(): (key: string | undefined) => boolean {
  const granted = useGrantedPermissions();
  return useCallback((key: string | undefined) => !key || granted.has(key), [granted]);
}

/**
 * The user's effective permission set as a Set, memoised on the array identity
 * so the hundreds of `useCan` calls across the panel do not each rebuild it.
 *
 * A user with no `permissions` field is treated as having none rather than
 * everything. That matters during the deployment window when a panel build
 * lands before the API that supplies the list: the panel goes quiet rather than
 * showing every action to everyone.
 */
function useGrantedPermissions(): ReadonlySet<string> {
  const { user } = useAuth();
  return useMemo(() => new Set(user?.permissions ?? []), [user?.permissions]);
}
