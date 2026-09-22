import {
  GoldOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App as AntApp, Avatar, Button, Dropdown, Input, Layout, Menu, Segmented, Spin, Tag, Typography } from 'antd';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '../auth/types';
import { useCanFn } from '../auth/useCan';
import { useAuth } from '../auth/useAuth';
import { BellOutlined } from '@ant-design/icons';
import { enableOrderAlerts, orderAlertSupport } from '../live/orderAlerts';
import { useLiveOrders } from '../live/useLiveOrders';
import { NAV_SECTIONS, findNavItem, type AdminZone } from './navigation';
import { useAdminZone } from './useAdminZone';

const { Header, Sider, Content } = Layout;

const ZONE_OPTIONS: { label: string; value: AdminZone; icon: React.ReactNode }[] = [
  { label: 'Supply Chain', value: 'supply', icon: <GoldOutlined /> },
  { label: 'Customer & Retail', value: 'commerce', icon: <ShopOutlined /> },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [zone, setZone] = useAdminZone();
  const [searchTerm, setSearchTerm] = useState('');

  const can = useCanFn();

  // The whole panel listens for orders: any screen gets notified, and every orders view refreshes.
  const live = useLiveOrders(can('ORDER_VIEW'), () => navigate('/b2c-orders'));
  const [alertsReady, setAlertsReady] = useState(false);
  useEffect(() => {
    if (!can('ORDER_VIEW')) return;
    void orderAlertSupport().then((s) => setAlertsReady(s === 'ready')).catch(() => undefined);
  }, [can]);
  const turnOnAlerts = async () => {
    try {
      const ok = await enableOrderAlerts();
      message[ok ? 'success' : 'warning'](ok ? 'Order alerts are on for this device' : 'Order alerts were not enabled');
      if (ok) setAlertsReady(false);
    } catch {
      message.error('Could not enable order alerts');
    }
  };

  /**
   * The menu is filtered by permission, not merely disabled. Someone with no
   * access to Price Lists has no business seeing the entry — an empty section
   * is removed entirely rather than left hanging.
   *
   * Search term matches against label, path, parent section, or description.
   */
  const menuItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return NAV_SECTIONS.flatMap((section) => {
      const visible = section.items.filter((item) => {
        if (!can(item.permission) || (item.zone && item.zone !== zone)) {
          return false;
        }
        if (!query) return true;
        return (
          item.label.toLowerCase().includes(query) ||
          item.path.toLowerCase().includes(query) ||
          section.label.toLowerCase().includes(query) ||
          (item.description && item.description.toLowerCase().includes(query))
        );
      });

      if (visible.length === 0) return [];

      return [
        {
          key: section.key,
          icon: section.icon,
          label: section.label,
          children: visible.map((item) => ({ key: item.path, label: item.label })),
        },
      ];
    });
  }, [can, zone, searchTerm]);

  const [userOpenKeys, setUserOpenKeys] = useState<string[]>(() =>
    NAV_SECTIONS.filter((section) =>
      section.items.some((item) => item.path === location.pathname),
    ).map((section) => section.key),
  );

  useEffect(() => {
    const currentSection = NAV_SECTIONS.find((section) =>
      section.items.some((item) => item.path === location.pathname),
    );
    if (currentSection) {
      setUserOpenKeys((prev) =>
        prev.includes(currentSection.key) ? prev : [...prev, currentSection.key],
      );
    }
  }, [location.pathname]);

  const activeOpenKeys = useMemo(() => {
    if (searchTerm.trim()) {
      return menuItems.map((s) => s.key);
    }
    return userOpenKeys;
  }, [searchTerm, menuItems, userOpenKeys]);

  /**
   * Switching zones can hide the screen the user is currently on — e.g.
   * viewing Orders and flipping to Supply Chain. Rather than leave them on a
   * page with no matching menu entry (or let RequirePermission's normal
   * guard handle it, which it would, but with a jarring "forbidden" flash for
   * a screen they DO have access to), send them to the dashboard, which is
   * always visible in both zones.
   */
  const handleZoneChange = (next: AdminZone) => {
    setZone(next);
    const current = findNavItem(location.pathname);
    if (current?.zone && current.zone !== next) {
      navigate('/');
    }
  };

  const handleLogout = async () => {
    await logout();
    message.success('Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={240}
        theme="light"
        className="admin-sidebar"
        style={{
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
          zIndex: 10,
          borderRight: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            height: 62,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0 8px' : '0 16px',
            borderBottom: '1px solid #f0fdf4',
            background: '#ffffff',
            gap: 10,
          }}
        >
          <img
            src="/svv-balaji.png"
            alt="SVV Balaji Logo"
            style={{
              height: collapsed ? 34 : 38,
              width: 'auto',
              maxHeight: 40,
              objectFit: 'contain',
              borderRadius: 6,
            }}
          />
          {!collapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Typography.Text strong style={{ fontSize: 15, lineHeight: 1.2, whiteSpace: 'nowrap', color: '#166534' }}>
                SVV Balaji
              </Typography.Text>
              <Typography.Text style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: '#e86a17' }}>
                Enterprise Portal
              </Typography.Text>
            </div>
          )}
        </div>

        {!collapsed && (
          <div
            style={{
              flexShrink: 0,
              padding: '10px 12px 6px 12px',
              background: '#ffffff',
              borderBottom: '1px solid #f0fdf4',
            }}
          >
            <Input
              prefix={<SearchOutlined style={{ color: '#16a34a' }} />}
              placeholder="Search menus..."
              size="small"
              allowClear
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                borderRadius: 8,
                backgroundColor: '#f0fdf4',
                borderColor: '#bbf7d0',
              }}
            />
          </div>
        )}

        <div className="sidebar-menu-scroll">
          <Menu
            mode="inline"
            items={menuItems}
            selectedKeys={[location.pathname]}
            openKeys={activeOpenKeys}
            onOpenChange={(keys) => {
              if (!searchTerm.trim()) {
                setUserOpenKeys(keys);
              }
            }}
            onClick={({ key }) => navigate(key)}
            style={{ borderInlineEnd: 'none' }}
          />

          {!collapsed && searchTerm.trim() && menuItems.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              No matching menus found
            </div>
          )}
        </div>
      </Sider>

      <Layout style={{ overflow: 'hidden' }}>
        <Header
          style={{
            padding: '0 16px 0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            height: 56,
            lineHeight: '56px',
            background: '#fff',
            zIndex: 1,
          }}
        >
          <Button
            type="text"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          />

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Segmented<AdminZone>
              value={zone}
              onChange={handleZoneChange}
              options={ZONE_OPTIONS.map((option) => ({
                label: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
                    {option.icon}
                    <span style={{ fontWeight: 600 }}>{option.label}</span>
                  </span>
                ),
                value: option.value,
              }))}
              style={{ padding: 4, backgroundColor: '#f1f5f9' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {can('ORDER_VIEW') ? (
              <Tag color={live === 'live' ? 'green' : live === 'connecting' ? 'default' : 'red'} title="Live order feed">
                ● {live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting' : 'Offline (catching up on reconnect)'}
              </Tag>
            ) : null}
            {alertsReady ? (
              <Button size="small" icon={<BellOutlined />} onClick={() => void turnOnAlerts()}>Enable order alerts</Button>
            ) : null}
            {user?.branch ? <Tag>{user.branch.name}</Tag> : null}
            <Tag color="blue">{user ? ROLE_LABELS[user.role] : ''}</Tag>

            <Dropdown
              menu={{
                items: [
                  {
                    key: 'profile',
                    icon: <UserOutlined />,
                    label: 'Profile & Security',
                    onClick: () => navigate('/profile'),
                  },
                  {
                    type: 'divider',
                  },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Sign out',
                    onClick: handleLogout,
                  },
                ],
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Avatar size="small">{user?.fullName?.charAt(0).toUpperCase()}</Avatar>
                <Typography.Text>{user?.fullName}</Typography.Text>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ margin: 16, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}>
          {/* Screens are code-split (see App.tsx). The boundary sits here rather
              than around the whole app so the sider and header stay on screen
              while a chunk loads — the page swaps, the shell does not blink. */}
          <Suspense
            fallback={
              <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
                <Spin size="large" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
