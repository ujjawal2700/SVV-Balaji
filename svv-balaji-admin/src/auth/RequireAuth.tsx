import { Space, Spin, Typography } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

/**
 * Gate for everything behind sign-in.
 *
 * Waits for the boot-time session restore before deciding, otherwise a hard
 * refresh would bounce a perfectly valid session to the login screen in the
 * moment before the refresh call returns.
 */
export function RequireAuth() {
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Space direction="vertical" align="center" size={12}>
          <Spin size="large" />
          <Typography.Text type="secondary">Restoring session…</Typography.Text>
        </Space>
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so login can send them back there.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
