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
const TAB_ROUTES = ['/', '/products', '/cart', '/orders', '/profile'];

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
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleNav = STORE_NAV.filter((item) => !item.requiresAccount || user);
  const isTabRoute = TAB_ROUTES.includes(location.pathname);
  // HomePage renders its own greeting header — see the note there — so the
  // generic brand header below would be a second header stacked on top of it.
  const isHome = location.pathname === '/';

  const navLinks = (onNavigate?: () => void) =>
    visibleNav.map((item) => (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onNavigate}
        style={({ isActive }) => ({
          color: isActive ? '#059669' : '#44403c',
          fontWeight: isActive ? 600 : 500,
          textDecoration: 'none',
          padding: '8px 0',
          display: 'block',
        })}
      >
        {item.label}
      </NavLink>
    ));

  return (
    <Layout style={{ minHeight: '100dvh', background: '#fafaf9' }}>
      {!isHome && (
        <Layout.Header
          className="store-safe-top"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            height: 'auto',
            lineHeight: 'normal',
            padding: '0 16px',
            background: '#ffffff',
            borderBottom: '1px solid #e7e5e4',
          }}
        >
          <div
            style={{
              maxWidth: 1080,
              margin: '0 auto',
              height: 'var(--store-header-height)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <Button
              type="text"
              icon={<MenuOutlined />}
              aria-label="Menu"
              onClick={() => setMenuOpen(true)}
              style={{ display: 'inline-flex' }}
              className="store-menu-button"
            />

            <Link to="/" style={{ textDecoration: 'none', marginRight: 'auto' }}>
              <Typography.Text strong style={{ fontSize: 17, color: '#1c1917' }}>
                Desi Tokri
              </Typography.Text>
            </Link>

            {/* A Link wrapping the icon, not a Button containing a Link. Nesting an
                anchor inside a button is invalid markup and screen readers announce
                it twice; this is one control with one label. */}
            <Link
              to="/cart"
              aria-label={`Cart, ${cart.count} item${cart.count === 1 ? '' : 's'}`}
              style={{ display: 'inline-flex', padding: 8, color: '#44403c' }}
            >
              <Badge count={cart.count} size="small" offset={[-2, 2]}>
                <ShoppingCartOutlined style={{ fontSize: 20, color: '#44403c' }} />
              </Badge>
            </Link>

            {/* Signed out this is the way in; signed in it is the way to the order
                history, which is the only thing an account is for here. */}
            <Link
              to={user ? '/orders' : '/login'}
              state={{ from: location.pathname }}
              aria-label={user ? 'Your account' : 'Sign in'}
              style={{ display: 'inline-flex', padding: 8, color: '#44403c' }}
            >
              <UserOutlined style={{ fontSize: 20 }} />
            </Link>
          </div>
        </Layout.Header>
      )}

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        placement="left"
        width={260}
        title="Desi Tokri"
      >
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {navLinks(() => setMenuOpen(false))}
        </Space>
      </Drawer>

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
