import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  LockOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Divider, Input, Segmented, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCustomerAuth, type UserRole } from '../auth/CustomerAuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useCustomerAuth();

  const [mobileNumber, setMobileNumber] = useState('9876543210');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [loginRole, setLoginRole] = useState<UserRole>('CUSTOMER');
  const [timer, setTimer] = useState(30);

  const destination = (location.state as { from?: string })?.from || (loginRole === 'RETAILER' ? '/profile' : '/');

  const handleSendOtp = () => {
    const cleanNum = mobileNumber.replace(/\D/g, '');
    if (cleanNum.length !== 10) {
      message.error('Please enter a valid 10-digit mobile number');
      return;
    }
    setStep('OTP');
    setOtp('1234'); // Auto pre-fill mock OTP for smooth convenience
    message.success('OTP sent to +91 ' + cleanNum + ' (Mock OTP: 1234)');
  };

  const handleVerifyOtp = () => {
    if (otp !== '1234') {
      message.error('Invalid OTP. Please enter 1234 for testing');
      return;
    }

    const success = login(mobileNumber, otp, loginRole);
    if (success) {
      message.success(`Welcome! Signed in as ${loginRole === 'RETAILER' ? 'Store Partner' : 'Customer'}`);
      navigate(destination, { replace: true });
    } else {
      message.error('Login failed. Please try again.');
    }
  };

  const handleQuickLogin = (roleToUse: UserRole) => {
    login('9876543210', '1234', roleToUse);
    message.success(`Logged in as ${roleToUse === 'RETAILER' ? 'Sri Balaji Provision Store' : 'Rahul Sharma'}`);
    navigate(roleToUse === 'RETAILER' ? '/profile' : '/', { replace: true });
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 120px)', background: '#f8fafc', padding: '24px 16px 60px' }}>
      {/* Mobile top back bar */}
      <div className="mobile-only" style={{ marginBottom: 16 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeftOutlined style={{ fontSize: 18, color: '#475569' }} />
          <Typography.Text strong style={{ fontSize: 15, color: '#334155' }}>
            Back to Store
          </Typography.Text>
        </button>
      </div>

      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        {/* Main Card */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Header Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              padding: '28px 24px',
              color: '#ffffff',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <div style={{ width: 64, height: 64, margin: '0 auto 12px', background: '#fff', borderRadius: 16, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
              <img src="/images/desi-tokri-cropped.png" alt="Desi Tokri" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <Typography.Title level={3} style={{ color: '#fff', margin: '0 0 4px 0', fontWeight: 800 }}>
              Welcome to Desi Tokri
            </Typography.Title>
            <Typography.Text style={{ color: '#ffedd5', fontSize: 13 }}>
              Farm-to-Fork Agro Staples & Wholesale Mandi Supply
            </Typography.Text>
          </div>

          <div style={{ padding: '24px' }}>
            {/* Role Switcher */}
            <div style={{ marginBottom: 20 }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#475569' }}>
                SIGN IN AS
              </Typography.Text>
              <Segmented
                block
                value={loginRole}
                onChange={(val) => setLoginRole(val as UserRole)}
                options={[
                  {
                    label: (
                      <div style={{ padding: '4px 0' }}>
                        <UserOutlined style={{ marginRight: 6 }} /> Customer (Personal)
                      </div>
                    ),
                    value: 'CUSTOMER',
                  },
                  {
                    label: (
                      <div style={{ padding: '4px 0' }}>
                        <ShopOutlined style={{ marginRight: 6 }} /> Retailer / Wholesale
                      </div>
                    ),
                    value: 'RETAILER',
                  },
                ]}
                style={{ background: '#f1f5f9', padding: 4, borderRadius: 12 }}
              />
            </div>

            {/* Test Helper Alert */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
              <Typography.Text style={{ color: '#1e40af', fontSize: 12 }}>
                ℹ️ <strong>Mock Demo Mode:</strong> Use any 10-digit phone number. Use OTP <strong>1234</strong>.
              </Typography.Text>
            </div>

            {step === 'PHONE' ? (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <Typography.Text strong style={{ display: 'block', marginBottom: 6, fontSize: 14 }}>
                    Mobile Number
                  </Typography.Text>
                  <Input
                    size="large"
                    prefix={<span style={{ color: '#64748b', fontWeight: 600, marginRight: 4 }}>+91</span>}
                    placeholder="Enter 10-digit mobile number"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    maxLength={10}
                    style={{ borderRadius: 10, height: 46 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    We'll send a 4-digit verification code.
                  </Typography.Text>
                </div>

                <Button
                  type="primary"
                  block
                  size="large"
                  onClick={handleSendOtp}
                  style={{
                    background: '#f97316',
                    borderColor: '#f97316',
                    height: 46,
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 15,
                  }}
                >
                  Continue with OTP
                </Button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Typography.Text strong style={{ fontSize: 14 }}>
                      Enter 4-Digit OTP
                    </Typography.Text>
                    <Button type="link" size="small" onClick={() => setStep('PHONE')} style={{ padding: 0, color: '#f97316' }}>
                      Change Phone (+91 {mobileNumber})
                    </Button>
                  </div>
                  <Input
                    size="large"
                    prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Enter 1234"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={4}
                    style={{ borderRadius: 10, height: 46, fontSize: 18, letterSpacing: 6, textAlign: 'center' }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    Mock OTP: <strong>1234</strong>
                  </Typography.Text>
                </div>

                <Button
                  type="primary"
                  block
                  size="large"
                  onClick={handleVerifyOtp}
                  style={{
                    background: '#f97316',
                    borderColor: '#f97316',
                    height: 46,
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 15,
                    marginBottom: 12,
                  }}
                >
                  Verify & Sign In
                </Button>

                <Button block onClick={() => setStep('PHONE')} style={{ borderRadius: 10, height: 40 }}>
                  Back
                </Button>
              </div>
            )}

            <Divider style={{ margin: '20px 0', color: '#94a3b8', fontSize: 12 }}>OR QUICK ACCESS</Divider>

            {/* Quick Demo One-Click Access */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Button
                onClick={() => handleQuickLogin('CUSTOMER')}
                style={{ borderRadius: 10, height: 38, fontSize: 12, fontWeight: 500 }}
              >
                👤 Customer Test
              </Button>
              <Button
                onClick={() => handleQuickLogin('RETAILER')}
                style={{ borderRadius: 10, height: 38, fontSize: 12, fontWeight: 500, borderColor: '#f97316', color: '#ea580c' }}
              >
                🏪 Retailer Test
              </Button>
            </div>
          </div>
        </div>

        {/* 'Become a Partner / Buy Wholesale' Callout Banner */}
        <div
          style={{
            marginTop: 20,
            background: '#ffffff',
            borderRadius: 18,
            border: '1px solid #fed7aa',
            padding: '20px 22px',
            boxShadow: '0 2px 8px rgba(249, 115, 22, 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#fff7ed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: '1px solid #ffedd5',
              }}
            >
              <ShopOutlined style={{ fontSize: 22, color: '#f97316' }} />
            </div>
            <div style={{ flex: 1 }}>
              <Tag color="orange" style={{ fontWeight: 700, borderRadius: 10, marginBottom: 4 }}>
                FOR KIRANAS & WHOLESALERS
              </Tag>
              <Typography.Title level={5} style={{ margin: '2px 0 4px 0', color: '#0f172a' }}>
                Become a Partner / Buy Wholesale
              </Typography.Title>
              <Typography.Text style={{ color: '#64748b', fontSize: 13, display: 'block', lineHeight: 1.4 }}>
                Register your store to get mandi-direct pricing, GST input tax credit invoices, up to 20% margin, and 15-day credit lines.
              </Typography.Text>

              <Link to="/register" style={{ textDecoration: 'none' }}>
                <Button
                  type="primary"
                  style={{
                    background: '#f97316',
                    borderColor: '#f97316',
                    borderRadius: 8,
                    fontWeight: 600,
                    marginTop: 12,
                  }}
                >
                  Register Business Store &rarr;
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
