import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { App as AntApp, Avatar, Button, Dropdown, Layout, Menu, Spin, Tag, Typography } from 'antd';
import { Suspense, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasRole, ROLE_LABELS } from '../auth/types';
import { useAuth } from '../auth/useAuth';
import { NAV_SECTIONS } from './navigation';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const [collapsed, setCollapsed] = useState(false);

  /**
   * The menu is filtered by role, not merely disabled. A Warehouse Manager has
   * no business seeing a "Price Lists" entry they cannot open — an empty
   * section is removed entirely rather than left hanging.
   */
  const menuItems = useMemo(
    () =>
      NAV_SECTIONS.flatMap((section) => {
        const visible = section.items.filter((item) => hasRole(user?.role, item.roles));
        if (visible.length === 0) return [];

        return [
          {
            key: section.key,
            icon: section.icon,
            label: section.label,
            children: visible.map((item) => ({ key: item.path, label: item.label })),
          },
        ];
      }),
    [user?.role],
  );

  const openKeys = useMemo(
    () =>
      NAV_SECTIONS.filter((section) =>
        section.items.some((item) => item.path === location.pathname),
      ).map((section) => section.key),
    [location.pathname],
  );

  const handleLogout = async () => {
    await logout();
    message.success('Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} trigger={null} width={232} theme="light">
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 20px',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
            {collapsed ? 'SVV' : 'SVV Balaji'}
          </Typography.Text>
        </div>

        <Menu
          mode="inline"
          items={menuItems}
          selectedKeys={[location.pathname]}
          defaultOpenKeys={openKeys}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 16px 0 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            height: 56,
            lineHeight: '56px',
          }}
        >
          <Button
            type="text"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user?.branch ? <Tag>{user.branch.name}</Tag> : null}
            <Tag color="blue">{user ? ROLE_LABELS[user.role] : ''}</Tag>

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
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Avatar size="small">{user?.fullName?.charAt(0).toUpperCase()}</Avatar>
                <Typography.Text>{user?.fullName}</Typography.Text>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content style={{ margin: 16 }}>
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
