import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Spin, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Suspense, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Permission } from '@shared/auth/permissions';
import { ROLE_LABELS } from '@shared/auth/types';
import { useAuth } from '@shared/auth/useAuth';
import { useCanFn } from '@shared/auth/useCan';
import { useIsMobile } from '@shared/hooks/useIsMobile';

const { Header, Sider, Content } = Layout;

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
 * Responsive app shell for the Field Executive panel.
 *
 * - Mobile (<768px): Preserves pure phone-app experience: fixed top green header with back navigation,
 *   full-width content, and fixed bottom navigation bar.
 * - Mid & Large screens (>=768px): Provides a modern web dashboard layout with
 *   a clean sidebar, back button in header bar with user profile/logout, and responsive content area.
 */
export function FieldShell({ tabs, title }: { tabs: ShellTab[]; title: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const can = useCanFn();
  const isMobile = useIsMobile();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const visible = useMemo(
    () => tabs.filter((tab) => !tab.permission || can(tab.permission)),
    [tabs, can],
  );

  /**
   * A child route keeps its parent tab lit — /more/seed lights More.
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

  const handleLogout = async () => {
    await logout();
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
              padding: collapsed ? 0 : '0 20px',
              borderBottom: '1px solid #f1f5f9',
              background: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                S
              </div>
              {!collapsed && (
                <Typography.Text strong style={{ fontSize: 16, color: '#f8fafc', whiteSpace: 'nowrap' }}>
                  {title}
                </Typography.Text>
              )}
            </div>
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
          justifyContent: 'center',
          height: 54,
          flex: '0 0 auto',
          borderBottom: '1px solid #1e293b',
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
        <Suspense fallback={fallback}>
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
                color: active ? '#059669' : '#64748b',
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
