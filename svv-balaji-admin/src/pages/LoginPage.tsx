import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import { authApi } from '@shared/api/auth';
import { useAuth } from '../auth/useAuth';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { user, initialising, login, reload } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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

  const onFinish = async (values: LoginForm) => {
    setSubmitting(true);
    setError(null);
    try {
      // Direct call to authApi to check if 2FA is needed
      const res = await authApi.login(values.email, values.password);
      if ('requiresTwoFactor' in res && res.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setTwoFactorToken(res.twoFactorToken);
      } else {
        // Normal login completion handled by context
        await login(values.email, values.password); // Using the context's login directly doesn't handle the multi-step return cleanly, let's adjust this!
        navigate(from, { replace: true });
      }
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
      const { tokenStore } = await import('../api/tokenStore');
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
              <Button type="link" onClick={() => setRequiresTwoFactor(false)}>
                Back to Login
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
