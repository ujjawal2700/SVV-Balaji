import { ArrowLeftOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Spin, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Suspense, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Permission } from '@shared/auth/permissions';
import { ROLE_LABELS } from '@shared/auth/types';
import { useAuth } from '@shared/auth/useAuth';
import { useCanFn } from '@shared/auth/useCan';
import { useIsMobile } from '@shared/hooks/useIsMobile';
import { OfflineBar, useSafeLogout } from '../offline/OfflineBar';

const { Header, Sider, Content } = Layout;

export interface ShellTab {
  path: string;
  label: string;
  icon: ReactNode;
  /** Hidden when the user does not hold this. */
  permission?: Permission;
  /** Small count on the icon — used for work waiting, not for totals. */
  badge?: number;
  /**
   * Limit the entry to one layout. The phone bottom bar has room for five
   * tabs, so Training, Sync and Profile sit under More there; the sidebar has
   * room for all of them, so it lists them directly and drops More.
   */
  only?: 'mobile' | 'desktop';
  /** Label under the icon in the phone bottom bar, when the full one would wrap. */
  shortLabel?: string;
}

/**
 * A phone screen reached from a tab rather than being one (Training, Sync,
 * Profile under More). The app bar shows its title with a back arrow, and the
 * parent tab stays lit.
 */
export interface ShellSubPage {
  path: string;
  title: string;
  /** The tab it belongs to, and where the back arrow goes. */
  parent: string;
}

const BAR_HEIGHT = 58;

/** The same logo the admin panel uses. BASE_URL keeps it working when the app is served under /field/. */
const LOGO_SRC = `${import.meta.env.BASE_URL}svv-balaji.png`;

/**
 * Responsive app shell for the Field Executive panel.
 *
 * - Mobile (<768px): Preserves pure phone-app experience: fixed top green header with back navigation,
 *   full-width content, and fixed bottom navigation bar.
 * - Mid & Large screens (>=768px): Provides a modern web dashboard layout with
 *   a clean sidebar, back button in header bar with user profile/logout, and responsive content area.
 */
export function FieldShell({
  tabs,
  title,
  subPages = [],
}: {
  tabs: ShellTab[];
  title: string;
  subPages?: ShellSubPage[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const can = useCanFn();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const safeLogout = useSafeLogout();
  const [collapsed, setCollapsed] = useState(false);

  const visible = useMemo(
    () =>
      tabs.filter(
        (tab) =>
          (!tab.permission || can(tab.permission)) &&
          (!tab.only || tab.only === (isMobile ? 'mobile' : 'desktop')),
      ),
    [tabs, can, isMobile],
  );

  /**
   * A child route keeps its parent tab lit — on a phone /more/training lights
   * More; in the sidebar it lights Training itself.
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

  // Phone only: a sub-page names itself in the app bar and lights its parent tab.
  const subPage = isMobile ? subPages.find((page) => location.pathname === page.path) : undefined;
  const mobileActivePath = subPage?.parent ?? activePath;

  const handleLogout = async () => {
    await safeLogout();
    navigate('/login', { replace: true });
  };

  const fallback = (
    <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
      <Spin size="large" />
    </div>
  );

  // Desktop & Tablet View (Website-style navigation)
  if (!isMobile) {
    const desktopMenuItems = visible.map((tab) => ({
      key: tab.path,
      icon: (
        <Badge count={tab.badge ?? 0} size="small" offset={[6, 0]}>
          <span style={{ fontSize: 16 }}>{tab.icon}</span>
        </Badge>
      ),
      label: tab.label,
    }));

    return (
      <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          trigger={null}
          width={224}
          theme="light"
          style={{
            borderRight: '1px solid #e2e8f0',
            boxShadow: '1px 0 3px rgba(15, 23, 42, 0.03)',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflowY: 'auto',
            background: '#ffffff',
          }}
        >
          <div
            style={{
              height: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '0 8px' : '0 16px',
              gap: 10,
              borderBottom: '1px solid #f0fdf4',
              background: '#ffffff',
            }}
          >
            <img
              src={LOGO_SRC}
              alt="SVV Balaji Logo"
              style={{ height: collapsed ? 34 : 38, width: 'auto', objectFit: 'contain' }}
            />
            {!collapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Typography.Text strong style={{ fontSize: 15, lineHeight: 1.2, whiteSpace: 'nowrap', color: '#166534' }}>
                  SVV Balaji
                </Typography.Text>
                <Typography.Text
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 700,
                    color: '#e86a17',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Field Operations
                </Typography.Text>
              </div>
            )}
          </div>

          <Menu
            mode="inline"
            items={desktopMenuItems}
            selectedKeys={[activePath]}
            onClick={({ key }) => navigate(key)}
            style={{ borderInlineEnd: 'none', marginTop: 12, background: 'transparent' }}
          />
        </Sider>

        <Layout style={{ background: '#f8fafc' }}>
          <Header
            style={{
              padding: '0 24px 0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#ffffff',
              borderBottom: '1px solid #e2e8f0',
              height: 60,
              lineHeight: '60px',
              position: 'sticky',
              top: 0,
              zIndex: 9,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Button
                type="text"
                aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((value) => !value)}
              />

              <Typography.Title level={5} style={{ margin: 0, color: '#0f172a' }}>
                {activePath === '/' ? title : (activeTab?.label ?? title)}
              </Typography.Title>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {user?.branch ? (
                <Tag color="success" style={{ borderRadius: 6, fontWeight: 500 }}>
                  {user.branch.name}
                </Tag>
              ) : null}
              <Tag color="processing" style={{ borderRadius: 6, fontWeight: 500 }}>
                {user ? ROLE_LABELS[user.role] : ''}
              </Tag>

              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'logout',
                      icon: <LogoutOutlined />,
                      label: 'Sign out',
                      onClick: handleLogout,
                    },
                  ],
                }}
                trigger={['click']}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <Avatar size="small" style={{ background: '#059669', fontWeight: 600 }}>
                    {user?.fullName?.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography.Text strong style={{ color: '#1e293b' }}>
                    {user?.fullName}
                  </Typography.Text>
                </div>
              </Dropdown>
            </div>
          </Header>

          <Content style={{ margin: '20px auto', width: '100%', maxWidth: 1280, padding: '0 20px' }}>
            <Suspense fallback={fallback}>
              <OfflineBar />
          <Outlet />
            </Suspense>
          </Content>
        </Layout>
      </Layout>
    );
  }

  // Mobile View (< 768px) - phone app experience with Slate header & clean tabs
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        width: '100%',
        margin: '0 auto',
      }}
    >
      <header
        className="field-appbar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#0f172a', // Sleek slate header
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 12,
          paddingRight: 12,
          minHeight: 54,
          flex: '0 0 auto',
          borderBottom: '1px solid #1e293b',
        }}
      >
        {subPage ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => navigate(subPage.parent)}
            style={{
              width: 32,
              height: 32,
              border: 'none',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              fontSize: 16,
            }}
          >
            <ArrowLeftOutlined />
          </button>
        ) : (
          <img src={LOGO_SRC} alt="SVV Balaji" style={{ height: 32, width: 32, objectFit: 'contain', flexShrink: 0 }} />
        )}
        <Typography.Text strong ellipsis style={{ color: '#fff', fontSize: 16, flex: 1, textAlign: 'center' }}>
          {subPage?.title ?? (activePath === '/' ? title : (activeTab?.label ?? title))}
        </Typography.Text>
        {/* Balances the logo so the title stays centred. */}
        <span style={{ width: 32, flexShrink: 0 }} />
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
        <Suspense fallback={fallback}>
          <OfflineBar />
              <Outlet />
        </Suspense>
      </main>

      <nav
        style={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          width: '100%',
          height: `calc(${BAR_HEIGHT}px + env(safe-area-inset-bottom))`,
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          display: 'grid',
          gridTemplateColumns: `repeat(${visible.length}, 1fr)`,
          zIndex: 20,
        }}
      >
        {visible.map((tab) => {
          const active = tab.path === mobileActivePath;

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
                color: active ? '#059669' : '#64748b',
                fontWeight: active ? 600 : 400,
                padding: 0,
                height: BAR_HEIGHT,
              }}
            >
              <Badge count={tab.badge ?? 0} size="small" offset={[2, -2]}>
                <span style={{ fontSize: 20, color: 'inherit' }}>{tab.icon}</span>
              </Badge>
              <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{tab.shortLabel ?? tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
