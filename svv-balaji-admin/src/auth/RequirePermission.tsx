import { Navigate, Outlet } from 'react-router-dom';
import { useCanKey } from './useCan';

/**
 * Route-level permission gate.
 *
 * Replaced RequireRole on 16 August. The difference is not cosmetic: the old
 * gate compared the user's role against a list written in navigation.tsx, so
 * changing who could open a screen meant editing and redeploying the panel.
 * This one asks whether the user holds the permission the server would check,
 * which a Super Admin controls from the Roles & Permissions screen.
 *
 * A screen with no `permission` is open to any signed-in user - that is how
 * /forbidden and the 404 stay reachable.
 *
 * Still a usability layer. The API enforces the same permission on every
 * endpoint behind the screen and would refuse the data regardless; the point
 * here is not to show someone a page that can only fill up with 403s.
 */
export function RequirePermission({ permission }: { permission?: string }) {
  const canKey = useCanKey();

  if (!canKey(permission)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
