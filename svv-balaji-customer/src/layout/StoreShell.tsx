import { Layout, Typography } from 'antd';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BOTTOM_NAV_HEIGHT, BottomNav } from './BottomNav';
import { DesktopFooter } from './DesktopFooter';
import { DesktopHeader } from './DesktopHeader';

/**
 * The five destinations with a tab in `BottomNav`. Everything else is a stack page.
 */
const TAB_ROUTES = ['/', '/categories', '/cart', '/orders', '/profile'];

/**
 * The shell frame every storefront page renders inside.
 *
 * Responsiveness architecture:
 * - Mobile (< 768px):
 *     Shows the app-style BottomNav on tab routes and pads content.
 * - Desktop (>= 768px):
 *     Renders DesktopHeader (omni-search, brand, location, links, cart, ledger)
 *     and DesktopFooter (trust badges, multi-column categories, support).
 */
export function StoreShell() {
  const location = useLocation();
  const isTabRoute = TAB_ROUTES.includes(location.pathname);

  return (
    <Layout style={{ minHeight: '100dvh', background: '#fafaf9', display: 'flex', flexDirection: 'column' }}>
      {/* Desktop Top Header (Hidden on mobile) */}
      <DesktopHeader />

      {/* Main Content Area */}
      <Layout.Content
        style={{
          flex: '1 0 auto',
          paddingBottom: isTabRoute ? BOTTOM_NAV_HEIGHT : undefined,
        }}
      >
        <Suspense
          fallback={
            <div className="store-container" style={{ color: '#78716c', padding: 40, textAlign: 'center' }}>
              Loading Storefront…
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </Layout.Content>

      {/* Mobile App Bottom Tab Bar (Hidden on desktop) */}
      {isTabRoute && <BottomNav />}

      {/* Desktop Rich Footer (Hidden on mobile) */}
      <DesktopFooter />

      {/* Mobile Simple Safe Footer for non-tab stack routes */}
      {!isTabRoute && (
        <Layout.Footer
          className="store-safe-bottom mobile-only"
          style={{ background: '#ffffff', borderTop: '1px solid #e7e5e4', padding: '16px 20px' }}
        >
          <div style={{ textAlign: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Desi Tokri Food &amp; Beverages Pvt. Ltd. — every pack traceable to the farm it came from.
            </Typography.Text>
          </div>
        </Layout.Footer>
      )}
    </Layout>
  );
}
