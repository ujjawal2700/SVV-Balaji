import { Badge, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Suspense, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Permission } from '@shared/auth/permissions';
import { useCanFn } from '@shared/auth/useCan';

export interface ShellTab {
  path: string;
  label: string;
  icon: ReactNode;
  /** Hidden when the user does not hold this. */
  permission?: Permission;
  /** Small count on the icon — used for work waiting, not for totals. */
  badge?: number;
}

const BAR_HEIGHT = 58;

/**
 * The app shell.
 *
 * Unlike the admin panel's MobileShell, this one does not fall back to a sider
 * on a wide screen. This app is a phone app; opened on a laptop it stays a
 * phone-shaped column in the middle of the window. That is a deliberate
 * decision rather than an omission — a layout that reflows into a desktop
 * dashboard is how the two apps start converging again, and the desktop views
 * of this data already exist in the admin panel.
 *
 * Fixed app bar, fixed bottom tabs, scrolling content between them. `100dvh`
 * and `env(safe-area-inset-*)` everywhere, because installed on a notched phone
 * there is no browser chrome to absorb the difference.
 */
export function FieldShell({ tabs, title }: { tabs: ShellTab[]; title: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const can = useCanFn();

  const visible = useMemo(
    () => tabs.filter((tab) => !tab.permission || can(tab.permission)),
    [tabs, can],
  );

  /**
   * A child route keeps its parent tab lit — /field/more/seed lights More.
   * `.at(-1)` takes the most specific match, so the root path (a prefix of
   * everything) never wins over a real one.
   */
  const activePath =
    visible
      .filter((tab) =>
        tab.path === '/'
          ? location.pathname === '/'
          : location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`),
      )
      .at(-1)?.path ?? '/';

  const activeTab = visible.find((tab) => tab.path === activePath);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f5f7f5',
        // On a wide screen the app stays a phone-shaped column rather than
        // stretching into a layout nobody designed.
        maxWidth: 720,
        margin: '0 auto',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.04)',
      }}
    >
      <header
        className="field-appbar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#1f7a3c',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 52,
          flex: '0 0 auto',
        }}
      >
        <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>
          {activePath === '/' ? title : (activeTab?.label ?? title)}
        </Typography.Text>
      </header>

      <main
        className="field-scroll"
        style={{
          flex: '1 1 auto',
          padding: 12,
          // Clear the fixed tab bar and the home indicator beneath it.
          paddingBottom: `calc(${BAR_HEIGHT}px + 16px + env(safe-area-inset-bottom))`,
        }}
      >
        <Suspense
          fallback={
            <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
              <Spin size="large" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <nav
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 0,
          width: '100%',
          maxWidth: 720,
          height: `calc(${BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: '#fff',
          borderTop: '1px solid #e8eae8',
          display: 'grid',
          gridTemplateColumns: `repeat(${visible.length}, 1fr)`,
          zIndex: 20,
        }}
      >
        {visible.map((tab) => {
          const active = tab.path === activePath;

          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              aria-current={active ? 'page' : undefined}
              style={{
                border: 'none',
                background: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                cursor: 'pointer',
                color: active ? '#1f7a3c' : '#8c8c8c',
                fontWeight: active ? 600 : 400,
                padding: 0,
                height: BAR_HEIGHT,
              }}
            >
              <Badge count={tab.badge ?? 0} size="small" offset={[2, -2]}>
                <span style={{ fontSize: 20, color: 'inherit' }}>{tab.icon}</span>
              </Badge>
              <span style={{ fontSize: 11 }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
