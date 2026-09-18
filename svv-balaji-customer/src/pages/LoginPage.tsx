import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Input, Typography, message } from 'antd';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

const OTP_LENGTH = 6;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requestOtp, verifyOtp } = useCustomerAuth();

  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [fullName, setFullName] = useState('');
  // Preserves the code across a shared referral link (/login?ref=CODE) into
  // the form, per the "link should preserve the referral code" requirement -
  // opening the link is not itself a successful referral (see
  // CustomerAuthContext.verifyOtp for where it actually gets validated).
  const [referralCode, setReferralCode] = useState(
    () => new URLSearchParams(location.search).get('ref')?.toUpperCase() ?? '',
  );
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [isNewAccount, setIsNewAccount] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const isRetailer = location.pathname.includes('retailer');
  const loginRole: 'CUSTOMER' | 'RETAILER' = isRetailer ? 'RETAILER' : 'CUSTOMER';

  const destination = (location.state as { from?: string })?.from;

  const cleanPhone = () => mobileNumber.replace(/\D/g, '');

  const handleSendOtp = async () => {
    const cleanNum = cleanPhone();
    if (cleanNum.length !== 10) {
      message.error('Please enter a valid 10-digit mobile number');
      return;
    }

    setSendingOtp(true);
    try {
      const response = await requestOtp(cleanNum);

      if (loginRole === 'RETAILER' && response.purpose === 'REGISTRATION') {
        // Verifying an unknown number here would self-provision it as a B2C
        // consumer account, not a retailer — the sign-in form can never create
        // a retailer account. Send them to register instead.
        message.info('No store partner account found for this number. Let’s get you registered.');
        navigate('/retailers/register', { state: { phone: cleanNum } });
        return;
      }

      setIsNewAccount(response.purpose === 'REGISTRATION');
      setDevCode(response.devCode ?? null);
      setStep('OTP');
      setOtp('');
      message.success(
        response.mode === 'mock'
          ? `OTP sent to +91 ${cleanNum} (dev code: ${response.devCode})`
          : `OTP sent to +91 ${cleanNum}`,
      );
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not send the OTP. Please try again.'));
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.trim();
    if (code.length !== OTP_LENGTH || !/^\d+$/.test(code)) {
      message.error(`Enter the ${OTP_LENGTH}-digit code sent to your phone`);
      return;
    }

    setVerifying(true);
    try {
      const outcome = await verifyOtp(
        cleanPhone(),
        code,
        isNewAccount && loginRole === 'CUSTOMER' && fullName.trim() ? fullName.trim() : undefined,
        isNewAccount && loginRole === 'CUSTOMER' && referralCode.trim() ? referralCode.trim() : undefined,
      );

      if (outcome.status === 'pending') {
        message.info(outcome.message);
        return;
      }

      message.success(
        `Welcome! Signed in as ${outcome.channel === 'B2B' ? 'Store Partner' : 'Customer'}`,
      );
      const fallback = outcome.channel === 'B2B' ? '/profile' : '/';
      navigate(destination || fallback, { replace: true });
    } catch (error) {
      message.error(apiErrorMessage(error, 'Invalid code. Please try again.'));
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = () => {
    if (sendingOtp) return;
    void handleSendOtp();
  };

  // Common input styles to match the "border-bottom only" design
  const inputStyle = {
    border: 'none',
    borderBottom: '2px solid #d9d9d9',
    borderRadius: 0,
    boxShadow: 'none',
    padding: '8px 0',
    fontSize: '16px',
    backgroundColor: 'transparent',
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
    }}>
      {/* Left side: Form */}
      <div className="login-left-pane">

        <button
          className="login-back-btn"
          onClick={() => navigate(-1)}
        >
          <ArrowLeftOutlined style={{ fontSize: 18 }} />
          <Typography.Text strong style={{ fontSize: 15, color: 'inherit' }}>
            Back
          </Typography.Text>
        </button>

        <div className="login-form-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: '400px', margin: '0 auto', width: '100%' }}>

          <img src="/images/desi-tokri-cropped.png" alt="Desi Tokri" className="login-logo" style={{ height: '70px', marginBottom: '60px' }} />

          <div className="login-text-container" style={{ marginBottom: '32px' }}>
            <Typography.Title level={2} style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#15803d', fontFamily: 'serif' }}>
              {loginRole === 'RETAILER' ? 'Partner with Us' : 'Your Cravings Stop Here'}
            </Typography.Title>
            <Typography.Text style={{ color: '#64748b', fontSize: 14 }}>
              {loginRole === 'RETAILER' ? 'Login to order snacks and spices in bulk for your store' : 'Login to get your favourite snacks, wafers, and spices fast'}
            </Typography.Text>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
            <div
              onClick={() => navigate('/login', { replace: true })}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                border: loginRole === 'CUSTOMER' ? '2px solid #15803d' : '2px solid #f1f5f9',
                backgroundColor: loginRole === 'CUSTOMER' ? '#f0fdf4' : '#f8fafc',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              <Typography.Text strong style={{ color: loginRole === 'CUSTOMER' ? '#15803d' : '#64748b' }}>Customer</Typography.Text>
            </div>
            <div
              onClick={() => navigate('/retailers/login', { replace: true })}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                border: loginRole === 'RETAILER' ? '2px solid #15803d' : '2px solid #f1f5f9',
                backgroundColor: loginRole === 'RETAILER' ? '#f0fdf4' : '#f8fafc',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              <Typography.Text strong style={{ color: loginRole === 'RETAILER' ? '#15803d' : '#64748b' }}>Store Partner</Typography.Text>
            </div>
          </div>



          {step === 'PHONE' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Mobile Number</Typography.Text>
                <Input
                  size="large"
                  placeholder="9876543210"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  inputMode="numeric"
                  style={inputStyle}
                  onFocus={(e) => e.target.style.borderBottom = '2px solid #15803d'}
                  onBlur={(e) => e.target.style.borderBottom = '2px solid #d9d9d9'}
                  onPressEnter={() => void handleSendOtp()}
                />
              </div>

              <div className="login-button-container" style={{ marginTop: 16 }}>
                <Button
                  className="login-button"
                  type="primary"
                  size="large"
                  loading={sendingOtp}
                  onClick={() => void handleSendOtp()}
                  style={{
                    background: '#15803d',
                    border: 'none',
                    height: 44,
                    padding: '0 40px',
                    borderRadius: 24,
                    fontWeight: 600,
                    fontSize: 16,
                    color: '#fff',
                    boxShadow: '0 4px 10px rgba(245, 158, 11, 0.3)',
                    width: '100%',
                  }}
                >
                  Send OTP
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {isNewAccount && loginRole === 'CUSTOMER' && (
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Your Name (optional)</Typography.Text>
                  <Input
                    size="large"
                    placeholder="How should we address you?"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={120}
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderBottom = '2px solid #15803d'}
                    onBlur={(e) => e.target.style.borderBottom = '2px solid #d9d9d9'}
                  />
                </div>
              )}

              {isNewAccount && loginRole === 'CUSTOMER' && (
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Referral Code (optional)</Typography.Text>
                  <Input
                    size="large"
                    placeholder="Have a friend's code?"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    style={inputStyle}
                    onFocus={(e) => e.target.style.borderBottom = '2px solid #15803d'}
                    onBlur={(e) => e.target.style.borderBottom = '2px solid #d9d9d9'}
                  />
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>OTP Code</Typography.Text>
                  <Button type="link" size="small" onClick={() => setStep('PHONE')} style={{ padding: 0, color: '#15803d', fontSize: 12 }}>
                    Change (+91 {cleanPhone()})
                  </Button>
                </div>
                <Input
                  size="large"
                  placeholder={'•'.repeat(OTP_LENGTH)}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                  maxLength={OTP_LENGTH}
                  inputMode="numeric"
                  style={{ ...inputStyle, letterSpacing: 8, fontSize: 20 }}
                  onFocus={(e) => e.target.style.borderBottom = '2px solid #15803d'}
                  onBlur={(e) => e.target.style.borderBottom = '2px solid #d9d9d9'}
                  onPressEnter={() => void handleVerifyOtp()}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  {devCode ? (
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      Dev OTP: {devCode}
                    </Typography.Text>
                  ) : <span />}
                  <Button type="link" size="small" disabled={sendingOtp} onClick={handleResendOtp} style={{ padding: 0, color: '#15803d', fontSize: 11 }}>
                    Resend OTP
                  </Button>
                </div>
              </div>

              <div className="login-button-container" style={{ marginTop: 16 }}>
                <Button
                  className="login-button"
                  type="primary"
                  size="large"
                  loading={verifying}
                  onClick={() => void handleVerifyOtp()}
                  style={{
                    background: '#15803d',
                    border: 'none',
                    height: 44,
                    padding: '0 40px',
                    borderRadius: 24,
                    fontWeight: 600,
                    fontSize: 16,
                    color: '#fff',
                    boxShadow: '0 4px 10px rgba(245, 158, 11, 0.3)',
                    width: '100%',
                  }}
                >
                  Verify & Log in
                </Button>
              </div>
            </div>
          )}

          {loginRole === 'RETAILER' && (
            <div style={{ display: 'flex', alignItems: 'center', margin: '40px 0', color: '#94a3b8' }}>
              <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
              <span style={{ padding: '0 16px', fontSize: 12, fontWeight: 500 }}>OR</span>
              <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
            </div>
          )}

          {loginRole === 'RETAILER' && (
            <div style={{ textAlign: 'center' }}>
              <Typography.Text style={{ color: '#64748b', fontSize: 13 }}>
                Don't have an account?{' '}
                <Link to="/retailers/register" style={{ color: '#15803d', fontWeight: 600, textDecoration: 'underline' }}>
                  Register
                </Link>
              </Typography.Text>
            </div>
          )}



        </div>
      </div>

      {/* Right side: Image with curved edge */}
      <div className="login-image-section">
        {/* Spices, wafers, namkeen image */}
        <img
          src="/images/svv-login.png"
          alt="SVV Login"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: '65% center',
            transform: 'scale(1.15)',
            transformOrigin: 'top left',
          }}
        />
        {/* Subtle overlay */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(to right, rgba(0,0,0,0.1), transparent)',
          pointerEvents: 'none'
        }} />
      </div>

      <style>{`
        @media (min-width: 992px) {
          .login-image-section {
            position: absolute !important;
            top: 0; right: 0; bottom: 0; left: 20%;
            display: block !important;
            z-index: 1;
            background: #e9ecef;
            overflow: hidden;
          }
          .login-left-pane {
            position: absolute !important;
            top: 0; bottom: 0; left: 0;
            width: 100%;
            background: #ffffff;
            z-index: 2;
            clip-path: ellipse(80% 150% at -25% 100%);
            display: flex;
            flex-direction: column;
            padding-top: 40px;
          }
          .login-back-btn {
            background: none; border: none; padding: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
            margin-left: 10%;
            margin-bottom: 20px;
            align-self: flex-start;
            color: #64748b;
          }
          .login-form-container {
            margin: auto 0 auto 10% !important;
            max-width: 420px !important;
            padding-bottom: 60px;
          }
          .login-logo {
            align-self: flex-start;
          }
          .login-text-container {
            text-align: left;
          }
          .login-button-container {
            text-align: left;
          }
          .login-button {
            width: auto !important;
            padding: 0 40px !important;
          }
        }
        @media (max-width: 991px) {
          .login-left-pane {
            padding: 24px;
            width: 100%;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            background: #ffffff;
            z-index: 2;
            position: relative;
          }
          .login-back-btn {
            background: none; border: none; padding: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
            margin-bottom: 40px;
            align-self: flex-start;
            color: #64748b;
          }
          .login-form-container {
            margin: 0 auto !important;
          }
          .login-image-section {
            display: none !important;
          }
          .login-logo {
            align-self: center;
          }
          .login-text-container {
            text-align: center;
          }
          .login-button-container {
            text-align: center;
          }
          .login-button {
            width: 100% !important;
          }
        }
        /* Override Ant Design Input hover/focus defaults */
        .ant-input:hover, .ant-input:focus {
          border-color: #15803d !important;
          box-shadow: none !important;
        }
      `}</style>
    </div>
  );
}
