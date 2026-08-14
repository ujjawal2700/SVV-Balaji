import { LogoutOutlined } from '@ant-design/icons';
import { App as AntApp, Avatar, Dropdown, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppLayout } from './AppLayout';

export interface ShellTab {
  path: string;
  label: string;
  icon: ReactNode;
}

const BAR_HEIGHT = 56;

export interface MobileShellProps {
  /** Two to four. Five is cramped on a small handset. */
  tabs: ShellTab[];
  /** The root path, matched exactly so its tab does not stay lit on children. */
  rootPath: string;
  /** Shown in the app bar on the root tab; other tabs show their own label. */
  title: string;
}

/**
 * The app shell shared by the role-scoped panels.
 *
 * On a wide screen it renders `AppLayout` — sider and all — because on a
 * desktop that is simply the better navigation, and a bottom tab bar there
 * would be a mobile idiom in the wrong place. On a phone it takes over: fixed
 * app bar, fixed bottom tabs, content scrolling between them.
 *
 * Extracted from FieldLayout when the second panel arrived. The behaviours
 * below are each a small thing that, if wrong, makes the whole app read as a
 * website — and they are exactly the sort of thing that gets fixed in one copy
 * and not the other:
 *
 *   - `100dvh` rather than `100vh`. Mobile Safari's `vh` includes the browser
 *     chrome that hides on scroll, leaving a bar-height gap at the foot of
 *     every page.
 *   - `env(safe-area-inset-bottom)` keeps the tab bar clear of the iPhone home
 *     indicator; without it the last tab sits half under the gesture bar.
 *   - The content area owns the scroll, not the document, so the bars never
 *     drift with rubber-banding.
 */
export function MobileShell({ tabs, rootPath, title }: MobileShellProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { message } = AntApp.useApp();

  const fallback = (
    <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
      <Spin size="large" />
    </div>
  );

  if (!isMobile) {
    return <AppLayout />;
  }

  const handleLogout = async () => {
    await logout();
    message.success('Signed out');
    navigate('/login', { replace: true });
  };

  // Exact match for the root, prefix match for the rest, so a detail route
  // under a tab keeps that tab lit. `.at(-1)` picks the most specific match.
  const activePath =
    tabs
      .filter((tab) =>
        tab.path === rootPath
          ? location.pathname === rootPath
          : location.pathname.startsWith(tab.path),
      )
      .at(-1)?.path ?? rootPath;

  const activeTab = tabs.find((tab) => tab.path === activePath);

  return (
    <div
      className="field-shell"
      style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f5f5f5' }}
    >
      <header
        style={{
          flex: '0 0 auto',
          height: BAR_HEIGHT,
          paddingTop: 'env(safe-area-inset-top)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Typography.Text strong style={{ fontSize: 17 }}>
          {activePath === rootPath ? title : activeTab?.label}
        </Typography.Text>

        <Dropdown
          menu={{
            items: [
              { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: handleLogout },
            ],
          }}
          trigger={['click']}
        >
          <Avatar size={32} style={{ cursor: 'pointer', background: '#1677ff' }}>
            {user?.fullName?.charAt(0).toUpperCase()}
          </Avatar>
        </Dropdown>
      </header>

      <main
        style={{
          flex: '1 1 auto',
          overflowY: 'auto',
          // Momentum scrolling. Without it the list stops dead on release,
          // which reads as "web page" instantly.
          WebkitOverflowScrolling: 'touch',
          padding: 12,
        }}
      >
        <Suspense fallback={fallback}>
          <Outlet />
        </Suspense>
      </main>

      <nav
        style={{
          flex: '0 0 auto',
          display: 'grid',
          gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              aria-current={active ? 'page' : undefined}
              style={{
                appearance: 'none',
                border: 'none',
                background: 'none',
                // 56px clears the 44px minimum touch target with room to spare.
                height: BAR_HEIGHT,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                cursor: 'pointer',
                color: active ? '#1677ff' : '#8c8c8c',
                fontSize: 11,
                // Stops the grey flash iOS paints over any tapped element.
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
