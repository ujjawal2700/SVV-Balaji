import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import { authApi } from '@shared/api/auth';
import { useAuth } from '../auth/useAuth';
import { tokenStore } from '../api/tokenStore';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { user, initialising, reload } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2FA state
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [verifyingTwoFactor, setVerifyingTwoFactor] = useState(false);

  // Where RequireAuth bounced them from, so they land back on it after signing in.
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  if (!initialising && user) {
    return <Navigate to={from} replace />;
  }

  /**
   * Sign in, which is now two shapes rather than one.
   *
   * `POST /auth/login` either returns a session or a 2FA challenge, so this page
   * owns the whole flow and finishes it itself: store the tokens, then `reload()`
   * to fetch the profile.
   *
   * It deliberately does NOT call the context's `login()` afterwards. That
   * helper posts to `/auth/login` itself, so calling it here sent the
   * credentials a second time — issuing a second session, orphaning the first
   * refresh token, and (on a 2FA account) getting back a challenge where a
   * session was expected.
   */
  const onFinish = async (values: LoginForm) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await authApi.login(values.email, values.password);

      if ('requiresTwoFactor' in result) {
        setRequiresTwoFactor(true);
        setTwoFactorToken(result.twoFactorToken);
        return;
      }

      tokenStore.set({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      // /auth/me rather than the login payload: it carries branch and status,
      // which the navigation needs and login does not return.
      await reload();
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not sign in'));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerifyTwoFactor = async () => {
    if (!twoFactorToken) return;
    setVerifyingTwoFactor(true);
    setError(null);
    try {
      const session = await authApi.verifyTwoFactorLogin(twoFactorToken, twoFactorCode);
      tokenStore.set({ accessToken: session.accessToken, refreshToken: session.refreshToken });
      await reload();
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid or expired 2FA code'));
      setVerifyingTwoFactor(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f5f5f5',
        padding: 16,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            SVV Balaji
          </Typography.Title>
          <Typography.Text type="secondary">Supply Chain Management</Typography.Text>
        </div>

        {error ? (
          <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
        ) : null}

        {requiresTwoFactor ? (
          <div>
            <Typography.Paragraph>
              Enter the 6-digit code from your authenticator app, or an 8-character recovery code.
            </Typography.Paragraph>
            <Input
              size="large"
              placeholder="000000"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.trim())}
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 4, marginBottom: 16 }}
              onPressEnter={onVerifyTwoFactor}
              autoFocus
            />
            <Button
              type="primary"
              block
              size="large"
              onClick={onVerifyTwoFactor}
              loading={verifyingTwoFactor}
              disabled={!twoFactorCode}
            >
              Verify & Sign In
            </Button>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Button
                type="link"
                onClick={() => {
                  // Clear the challenge as well as the flag: the token is
                  // single-use and tied to that attempt, so keeping it would
                  // mean retrying with something the server has finished with.
                  setRequiresTwoFactor(false);
                  setTwoFactorToken(null);
                  setTwoFactorCode('');
                  setError(null);
                }}
              >
                Back to sign in
              </Button>
            </div>
          </div>
        ) : (
          <Form<LoginForm> layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Enter your email' },
                { type: 'email', message: 'That does not look like an email address' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="you@svvbalaji.com" autoComplete="username" />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, message: 'Enter your password' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Password"
                autoComplete="current-password"
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" block loading={submitting}>
              Sign in
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
