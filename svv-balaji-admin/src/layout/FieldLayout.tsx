import {
  EnvironmentOutlined,
  ExperimentOutlined,
  HomeOutlined,
  LogoutOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { App as AntApp, Avatar, Dropdown, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppLayout } from './AppLayout';

export interface FieldTab {
  path: string;
  label: string;
  icon: ReactNode;
}

/**
 * The four things a field executive does. Four is the ceiling for a bottom bar
 * — five is cramped on a small handset and anything more wants a "More" tab,
 * which is where app navigation starts feeling like a menu again.
 */
export const FIELD_TABS: FieldTab[] = [
  { path: '/field', label: 'Home', icon: <HomeOutlined /> },
  { path: '/field/visits', label: 'Visits', icon: <EnvironmentOutlined /> },
  { path: '/field/seed', label: 'Seed', icon: <ExperimentOutlined /> },
  { path: '/field/training', label: 'Training', icon: <ReadOutlined /> },
];

const BAR_HEIGHT = 56;

/**
 * The field panel's shell.
 *
 * On a desktop this renders nothing of its own — the screens sit inside the
 * ordinary AppLayout with its sider, because on a large screen that is the
 * better navigation and pretending otherwise would be styling for its own sake.
 *
 * On a phone it takes over: fixed app bar, fixed bottom tabs, and the content
 * scrolling between them. That single change — persistent bottom navigation
 * rather than a hamburger — is most of what makes a web app read as an app.
 *
 * Three details that matter more than they look:
 *
 *   - `env(safe-area-inset-bottom)` keeps the tab bar clear of the iPhone home
 *     indicator. Without it the last tab is half under the gesture bar.
 *   - `100dvh` rather than `100vh`, because mobile Safari's `vh` includes the
 *     browser chrome that hides on scroll, leaving a bar-height gap at the
 *     bottom of every page.
 *   - the content area owns the scroll, not the document, so the bars never
 *     drift with rubber-banding.
 */
export function FieldLayout() {
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

  // On a wide screen the field routes live inside the ordinary shell, sider and
  // all. AppLayout renders its own <Outlet/>, so nesting is all this takes.
  if (!isMobile) {
    return <AppLayout />;
  }

  const handleLogout = async () => {
    await logout();
    message.success('Signed out');
    navigate('/login', { replace: true });
  };

  // Exact match for Home, prefix match for the rest, so a detail route under
  // /field/visits keeps its tab lit.
  const activePath =
    FIELD_TABS.filter((tab) =>
      tab.path === '/field' ? location.pathname === '/field' : location.pathname.startsWith(tab.path),
    ).at(-1)?.path ?? '/field';

  const activeTab = FIELD_TABS.find((tab) => tab.path === activePath);

  return (
    <div
      className="field-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: '#f5f5f5',
      }}
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
          {activeTab?.label === 'Home' ? 'SVV Balaji' : activeTab?.label}
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
          gridTemplateColumns: `repeat(${FIELD_TABS.length}, 1fr)`,
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {FIELD_TABS.map((tab) => {
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
