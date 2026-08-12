import { Navigate, Outlet } from 'react-router-dom';
import { hasRole, type UserRole } from './types';
import { useAuth } from './useAuth';

/**
 * Route-level role gate.
 *
 * This is a usability layer, not a security one - the API enforces the same
 * boundaries with `@Roles()` and would refuse the request anyway. The point
 * here is that a Warehouse Manager should not be shown a screen that will only
 * hand them a 403 when they touch it.
 */
export function RequireRole({ allowed }: { allowed: readonly UserRole[] }) {
  const { user } = useAuth();

  if (!hasRole(user?.role, allowed)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
