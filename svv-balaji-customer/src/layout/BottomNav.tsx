import {
  AppstoreOutlined,
  FileTextOutlined,
  HomeFilled,
  HomeOutlined,
  ShoppingCartOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Badge } from 'antd';
import { NavLink } from 'react-router-dom';
import { useCart } from '../cart/useCart';

/**
 * The app-style bottom tab bar.
 *
 * Fixed to the viewport, not the layout flow — `StoreShell` pads its content
 * area by this bar's height so the last card on any page is never tucked
 * underneath it. This mirrors the "retailer" ordering UI (reorder, schemes,
 * credit position) rather than the FRD 29 public-shopper reading of the app;
 * see the comment on `HomePage`.
 */
const TABS = [
  { path: '/', label: 'Home', icon: HomeOutlined, activeIcon: HomeFilled, end: true },
  { path: '/products', label: 'Categories', icon: AppstoreOutlined, activeIcon: AppstoreOutlined, end: false },
  { path: '/cart', label: 'Cart', icon: ShoppingCartOutlined, activeIcon: ShoppingCartOutlined, end: false },
  { path: '/orders', label: 'Orders', icon: FileTextOutlined, activeIcon: FileTextOutlined, end: false },
  { path: '/profile', label: 'Profile', icon: UserOutlined, activeIcon: UserOutlined, end: false },
] as const;

const ACTIVE_COLOR = '#1d4ed8';
const INACTIVE_COLOR = '#78716c';

export function BottomNav() {
  const cart = useCart();

  return (
    <nav
      className="store-safe-bottom"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        background: '#ffffff',
        borderTop: '1px solid #e7e5e4',
        boxShadow: '0 -2px 12px 0 rgba(28, 25, 23, 0.06)',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.end}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '8px 4px 6px',
              textDecoration: 'none',
            }}
          >
            {({ isActive }) => {
              const Icon = isActive ? tab.activeIcon : tab.icon;
              const color = isActive ? ACTIVE_COLOR : INACTIVE_COLOR;
              const iconNode = <Icon style={{ fontSize: 22, color }} />;
              return (
                <>
                  {tab.path === '/cart' ? (
                    <Badge count={cart.count} size="small" offset={[-2, 2]}>
                      {iconNode}
                    </Badge>
                  ) : (
                    iconNode
                  )}
                  <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 500, color }}>
                    {tab.label}
                  </span>
                </>
              );
            }}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Read by pages that need to keep content clear of the fixed bar. */
export const BOTTOM_NAV_HEIGHT = 58;
