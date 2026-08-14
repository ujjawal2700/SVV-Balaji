import { Navigate, Outlet } from 'react-router-dom';
import { hasRole, type UserRole } from './types';
import { useAuth } from './useAuth';

/**
 * Route-level role gate.
 *
 * @deprecated Superseded by RequirePermission on 16 August 2026. Access is now
 * decided by permissions stored in the database, not by role lists compiled
 * into the panel - a route guarded this way cannot be changed by a Super Admin
 * without a redeploy, which is the whole thing the permission tables removed.
 *
 * Kept only so that a screen added on a branch during the changeover still
 * compiles. Nothing in the router uses it. If you find yourself importing it,
 * add a permission to the backend registry and use RequirePermission instead.
 */
export function RequireRole({ allowed }: { allowed: readonly UserRole[] }) {
  const { user } = useAuth();

  if (!hasRole(user?.role, allowed)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
