import { MenuOutlined, ShoppingCartOutlined, UserOutlined } from '@ant-design/icons';
import { Badge, Button, Drawer, Layout, Space, Typography } from 'antd';
import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@shared/auth/useAuth';
import { useCart } from '../cart/useCart';
import { BOTTOM_NAV_HEIGHT, BottomNav } from './BottomNav';
import { STORE_NAV } from './navigation';

/**
 * The five destinations with a tab in `BottomNav`. Everything else (trace,
 * login/register, checkout, product detail, order tracking) is a stack page
 * reached FROM one of these — it keeps the generic top header and gets no
 * bottom bar, the same way a detail screen pushed on top of a tab does not
 * carry its own copy of the tab bar.
 */
const TAB_ROUTES = ['/', '/categories', '/cart', '/orders', '/profile'];

/**
 * The frame every storefront page renders inside.
 *
 * Two things make this different from `FieldShell` and the admin layout, and
 * both are worth stating because they are easy to undo by accident:
 *
 * 1. It renders SIGNED OUT. Browsing, product detail and pack tracing are
 *    public — the whole point of the QR code is that anybody holding a pack can
 *    use it, and nobody scans a bag in a shop and then creates an account.
 *    Nothing in this shell may assume `user` exists.
 *
 * 2. It has no permission model. `useCan` and the permission registry are the
 *    staff apps' concern. A customer's access is decided by ownership — your
 *    orders are yours — which is enforced on the server, not by hiding a link.
 */
export function StoreShell() {
  const { user } = useAuth();
  const cart = useCart();
  const location = useLocation();
  const isTabRoute = TAB_ROUTES.includes(location.pathname);

  return (
    <Layout style={{ minHeight: '100dvh', background: '#fafaf9' }}>

      <Layout.Content style={isTabRoute ? { paddingBottom: BOTTOM_NAV_HEIGHT } : undefined}>
        {/* Every page is lazily loaded in App.tsx, so the boundary belongs here
            rather than being repeated per route. */}
        <Suspense
          fallback={
            <div className="store-container" style={{ color: '#78716c' }}>
              Loading…
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </Layout.Content>

      {isTabRoute ? (
        <BottomNav />
      ) : (
        <Layout.Footer
          className="store-safe-bottom"
          style={{ background: '#ffffff', borderTop: '1px solid #e7e5e4' }}
        >
          <div className="store-container" style={{ paddingBottom: 20 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Desi Tokri Food &amp; Beverages Pvt. Ltd. — every pack traceable to the farm it came
              from.
            </Typography.Text>
          </div>
        </Layout.Footer>
      )}
    </Layout>
  );
}
