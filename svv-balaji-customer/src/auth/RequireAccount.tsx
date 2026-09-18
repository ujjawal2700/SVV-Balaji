import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useCustomerAuth } from './CustomerAuthContext';

/**
 * The gate for the three screens that need to know who you are: checkout, order
 * history and order tracking.
 *
 * Reads the storefront's own session (`useCustomerAuth`, backed by
 * `CustomerAccount`) rather than `@shared/auth/useAuth`, which is the staff
 * panel's session — a customer has no `User` row, so that hook can never
 * report them signed in. Separate from `@shared/auth/RequireAuth` on purpose
 * too: the staff guard redirects to a login screen and that is the end of it;
 * here the person is usually mid-purchase, so where they were going has to
 * survive the round trip or they land on a home page with a full cart and no
 * idea what happened. `state.from` is what LoginPage sends them back to.
 *
 * There is no permission check. A customer's access is decided by ownership —
 * your orders are yours — and that is enforced on the server. Hiding a route is
 * not access control and must not be mistaken for it.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { isLoggedIn, initialising } = useCustomerAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '50dvh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
