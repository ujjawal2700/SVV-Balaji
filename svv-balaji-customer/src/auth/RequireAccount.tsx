import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@shared/auth/useAuth';

/**
 * The gate for the three screens that need to know who you are: checkout, order
 * history and order tracking.
 *
 * Separate from `@shared/auth/RequireAuth` on purpose. The staff guard redirects
 * to a login screen and that is the end of it; here the person is usually
 * mid-purchase, so where they were going has to survive the round trip or they
 * land on a home page with a full cart and no idea what happened. `state.from`
 * is what LoginPage sends them back to.
 *
 * There is no permission check. A customer's access is decided by ownership —
 * your orders are yours — and that is enforced on the server. Hiding a route is
 * not access control and must not be mistaken for it.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '50dvh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
