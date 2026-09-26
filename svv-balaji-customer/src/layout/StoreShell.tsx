import { Layout } from 'antd';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { DesktopFooter } from './DesktopFooter';
import { DesktopHeader } from './DesktopHeader';

/**
 * Pages whose first element is a full-bleed coloured banner that should reach
 * the top edge. They skip the phone top gap (the white strip would sit above
 * the banner) and pad the banner for the notch themselves.
 */
const FULL_BLEED_ROUTES = ['/profile'];

/**
 * The shell frame every storefront page renders inside.
 *
 * Responsiveness architecture:
 * - Mobile (< 768px):
 *     Shows the app-style BottomNav on every page. `.store-content` pads
 *     itself by --store-bottom-nav (styles.css) so nothing hides behind it, and
 *     pages with their own fixed action bar (cart, checkout, product) sit that
 *     bar on top of it at `bottom: var(--store-bottom-nav)`.
 * - Desktop (>= 768px):
 *     Renders DesktopHeader (omni-search, brand, location, links, cart, ledger)
 *     and DesktopFooter (trust badges, multi-column categories, support).
 */
export function StoreShell() {
  const location = useLocation();
  const fullBleed = FULL_BLEED_ROUTES.includes(location.pathname);

  return (
    <Layout style={{ minHeight: '100dvh', background: '#fafaf9', display: 'flex', flexDirection: 'column' }}>
      {/* Desktop Top Header (Hidden on mobile) */}
      <DesktopHeader />

      {/* Phone-only fixed strip that gives every page the same breathing room at the top. */}
      {!fullBleed && <div className="store-top-gap" aria-hidden />}

      {/* Main Content Area */}
      <Layout.Content
        className={fullBleed ? 'store-content store-content--bleed' : 'store-content'}
        style={{ flex: '1 0 auto' }}
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

      {/* Mobile App Bottom Tab Bar — on every page (hidden on desktop) */}
      <BottomNav />

      {/* Desktop Rich Footer (Hidden on mobile) */}
      <DesktopFooter />
    </Layout>
  );
}
