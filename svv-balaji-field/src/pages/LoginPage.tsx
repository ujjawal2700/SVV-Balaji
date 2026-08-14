import { DownloadOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { useAuth } from '@shared/auth/useAuth';
import {
  canPromptInstall,
  isIos,
  isStandalone,
  onInstallAvailabilityChange,
  promptInstall,
} from '../pwa';

/**
 * The field app's own sign-in.
 *
 * Same credentials as the admin panel — one backend, one users table, one
 * password. What differs is where the session is kept: this app stores its
 * refresh token under its own key (see shared/config.ts), because the two apps
 * share an origin and the backend holds one refresh hash per user. Without
 * separate keys, signing in here would silently end an admin session in another
 * tab.
 *
 * The install prompt lives here rather than buried in settings, because the
 * login screen is the one place every user reliably visits, and installing
 * before signing in means the session lands in the installed app rather than in
 * a browser tab they then abandon.
 */
export function LoginPage() {
  const { login } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installable, setInstallable] = useState(canPromptInstall());

  useEffect(() => onInstallAvailabilityChange(setInstallable), []);

  const onFinish = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(values.email, values.password);
    } catch (caught) {
      setError(apiErrorMessage(caught, 'Could not sign in. Check the email and password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const showIosHint = isIos() && !isStandalone();

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 20,
        paddingTop: 'calc(20px + env(safe-area-inset-top))',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(160deg, #1f7a3c 0%, #14532a 100%)',
      }}
    >
      <Space direction="vertical" size={20} style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
        <div style={{ textAlign: 'center' }}>
          <Typography.Title level={2} style={{ color: '#fff', margin: 0 }}>
            SVV Balaji
          </Typography.Title>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            Field Executive
          </Typography.Text>
        </div>

        <Card styles={{ body: { padding: 20 } }}>
          <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, message: 'Enter your email' }]}
            >
              <Input
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="you@svvbalaji.com"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Enter your password' }]}
            >
              <Input.Password autoComplete="current-password" placeholder="••••••••" />
            </Form.Item>

            {error ? (
              <Form.Item>
                <Alert type="error" showIcon message={error} />
              </Form.Item>
            ) : null}

            <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
              Sign in
            </Button>
          </Form>
        </Card>

        {installable ? (
          <Button
            block
            size="large"
            icon={<DownloadOutlined />}
            onClick={() => void promptInstall()}
            style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
          >
            Add to home screen
          </Button>
        ) : null}

        {showIosHint && !installable ? (
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Typography.Text style={{ fontSize: 13 }}>
              <ShareAltOutlined /> To install: tap <strong>Share</strong>, then{' '}
              <strong>Add to Home Screen</strong>. It then opens like an app, without the address
              bar.
            </Typography.Text>
          </Card>
        ) : null}

        <Typography.Text
          style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' }}
        >
          Managers and office staff sign in at the main panel instead.
        </Typography.Text>
      </Space>
    </div>
  );
}
