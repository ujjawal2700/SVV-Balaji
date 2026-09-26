import {
  GoldOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App as AntApp, Avatar, Badge, Button, Dropdown, Input, Layout, Menu, Segmented, Spin, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { deliveryApi } from '@shared/api/delivery';
import { DELIVERY_KEYS } from '@shared/hooks/useDelivery';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '../auth/types';
import { useCanFn } from '../auth/useCan';
import { useAuth } from '../auth/useAuth';
import { BellOutlined } from '@ant-design/icons';
import { enableOrderAlerts, orderAlertSupport } from '../live/orderAlerts';
import { useLiveOrders } from '../live/useLiveOrders';
import { NAV_SECTIONS, findNavItem, type AdminZone, type NavItem } from './navigation';
import { useAdminZone } from './useAdminZone';

const { Header, Sider, Content } = Layout;

type MenuEntry = Required<MenuProps>['items'][number];
const groupKey = (key: string) => `group:${key}`;

/**
 * A section's entries as menu items, with grouped entries gathered under one
 * sub-menu at the position of the first of them. Group keys are prefixed so a
 * click on the sub-menu title is never taken for a path.
 */
function nestGroups(items: NavItem[], counts: Record<NonNullable<NavItem['count']>, number>) {
  const out: Array<MenuEntry & { key: string }> = [];
  const groups = new Map<string, MenuEntry[]>();
  for (const item of items) {
    const n = item.count ? counts[item.count] : 0;
    const entry: MenuEntry = {
      key: item.path,
      label: n ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {item.label}
          <Badge count={n} size="small" style={{ background: '#ff8a00' }} />
        </span>
      ) : item.label,
    };
    if (!item.group) {
      out.push(entry as MenuEntry & { key: string });
      continue;
    }
    const existing = groups.get(item.group.key);
    if (existing) {
      existing.push(entry);
    } else {
      const children: MenuEntry[] = [entry];
      groups.set(item.group.key, children);
      out.push({ key: groupKey(item.group.key), label: item.group.label, children });
    }
  }
  return out;
}

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
  // Riders awaiting approval, shown as a count on their menu entry. Same query
  // key as the Pending Approval page, so approving there updates the badge.
  const pendingRiders = useQuery({
    queryKey: DELIVERY_KEYS.riders({ status: 'PENDING_APPROVAL' }),
    queryFn: () => deliveryApi.riders({ status: 'PENDING_APPROVAL' }),
    enabled: can('RIDERS_VIEW'),
    refetchInterval: 60_000,
  });
  const counts: Record<NonNullable<NavItem['count']>, number> = { pendingRiders: pendingRiders.data?.length ?? 0 };

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
          (item.group && item.group.label.toLowerCase().includes(query)) ||
          (item.description && item.description.toLowerCase().includes(query))
        );
      });

      if (visible.length === 0) return [];

      return [
        {
          key: section.key,
          icon: section.icon,
          label: section.label,
          children: nestGroups(visible, counts),
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can, zone, searchTerm, counts.pendingRiders]);

  /**
   * The menu entry a URL belongs to. A detail page such as /seed-stock/:id has
   * no entry of its own, so the longest nav path it sits under stays lit.
   */
  const activeNavPath = useMemo(() => {
    const path = location.pathname;
    return (
      NAV_SECTIONS.flatMap((section) => section.items)
        .filter((item) => item.path === path || (item.path !== '/' && path.startsWith(`${item.path}/`)))
        .sort((a, b) => b.path.length - a.path.length)[0]?.path ?? path
    );
  }, [location.pathname]);

  /** The section (and sub-menu, if any) holding the current screen. */
  const openKeysFor = (path: string) => {
    const section = NAV_SECTIONS.find((sec) => sec.items.some((item) => item.path === path));
    const item = section?.items.find((i) => i.path === path);
    return section ? [section.key, ...(item?.group ? [groupKey(item.group.key)] : [])] : [];
  };

  const [userOpenKeys, setUserOpenKeys] = useState<string[]>(() => openKeysFor(activeNavPath));

  useEffect(() => {
    const keys = openKeysFor(activeNavPath);
    if (keys.length) {
      setUserOpenKeys((prev) => (keys.every((k) => prev.includes(k)) ? prev : [...new Set([...prev, ...keys])]));
    }
  }, [activeNavPath]);

  const activeOpenKeys = useMemo(() => {
    if (searchTerm.trim()) {
      // Searching opens every section and sub-menu that has a match.
      return menuItems.flatMap((s) => [s.key, ...s.children.flatMap((c) => ('children' in c ? [String(c.key)] : []))]);
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
            selectedKeys={[activeNavPath]}
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
