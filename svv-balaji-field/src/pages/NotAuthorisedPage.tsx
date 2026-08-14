import { LogoutOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Card, Result, Space, Typography } from 'antd';
import { ROLE_LABELS } from '@shared/auth/types';
import { useAuth } from '@shared/auth/useAuth';

/**
 * What a non-field user sees if they reach this app.
 *
 * This is the visible half of the strict split. It is not an error page — the
 * person did nothing wrong, they are simply signed into the wrong front door —
 * so it names their role, says where their work actually is, and offers the two
 * useful actions rather than a stack trace.
 *
 * It deliberately does not silently redirect to the admin panel. A redirect
 * from an installed app would bounce the user out into a browser with no
 * explanation, and they would have no idea why the icon they tapped opened
 * something else.
 */
export function NotAuthorisedPage() {
  const { user, logout } = useAuth();

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        paddingTop: 'calc(20px + env(safe-area-inset-top))',
      }}
    >
      <Card style={{ maxWidth: 460, width: '100%' }}>
        <Result
          icon={<StopOutlined style={{ color: '#d48806' }} />}
          title="This app is for field executives"
          subTitle={
            <Space direction="vertical" size={10} style={{ marginTop: 8 }}>
              <Typography.Text>
                You are signed in as <strong>{user?.fullName}</strong>
                {user ? ` (${ROLE_LABELS[user.role]})` : ''}, and your role does not include field
                work.
              </Typography.Text>
              <Typography.Text type="secondary">
                Your screens are on the main panel. If this is wrong, a Super Admin can grant field
                access under Administration → Roles &amp; Permissions.
              </Typography.Text>
            </Space>
          }
          extra={
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                block
                size="large"
                href="/"
                // Leaves this app entirely — the admin panel is a separate
                // build at the domain root, so this is a real navigation and
                // not a router link.
              >
                Open the main panel
              </Button>
              <Button block icon={<LogoutOutlined />} onClick={() => void logout()}>
                Sign in as someone else
              </Button>
            </Space>
          }
        />
      </Card>
    </div>
  );
}
