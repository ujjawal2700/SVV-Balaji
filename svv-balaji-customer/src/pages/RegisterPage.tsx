import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ShopOutlined,
} from '@ant-design/icons';
import {
  Button,
  Col,
  Input,
  Result,
  Row,
  Steps,
  Typography,
  message,
} from 'antd';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

const OTP_LENGTH = 6;
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requestOtp, registerRetailer } = useCustomerAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state — field-for-field what POST /storefront/auth/register-retailer accepts.
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState((location.state as { phone?: string })?.phone ?? '');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('');
  // Preserves the code across a shared referral link (/retailers/register?ref=CODE).
  const [referralCode, setReferralCode] = useState(
    () => new URLSearchParams(location.search).get('ref')?.toUpperCase() ?? '',
  );

  // Phone verification — a separate OTP challenge, consumed by the final
  // submit itself (registerRetailer verifies the code server-side). There is
  // no safe way to "pre-verify" it without risking self-provisioning this
  // number as a B2C account instead — see CustomerAuthContext.verifyOtp.
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);

  const cleanPhone = () => phone.replace(/\D/g, '');

  const handleSendOtp = async () => {
    const cleanNum = cleanPhone();
    if (cleanNum.length !== 10) {
      message.error('Enter a valid 10-digit mobile number first');
      return;
    }
    setSendingOtp(true);
    try {
      const response = await requestOtp(cleanNum, 'RETAILER');
      setOtpSent(true);
      setDevCode(response.devCode ?? null);
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

  const handleNext = () => {
    if (currentStep === 0) {
      if (!storeName.trim() || !ownerName.trim() || cleanPhone().length !== 10) {
        message.error('Please complete the store name, proprietor name and a valid 10-digit mobile number.');
        return;
      }
      if (!otpSent) {
        message.error('Send and enter the OTP sent to your mobile number.');
        return;
      }
      if (otpCode.trim().length !== OTP_LENGTH) {
        message.error(`Enter the ${OTP_LENGTH}-digit code sent to your phone.`);
        return;
      }
      if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
        message.error('Enter a valid email address, or leave it blank.');
        return;
      }
    } else if (currentStep === 1) {
      const gstinValue = gstin.trim().toUpperCase();
      if (!GSTIN_PATTERN.test(gstinValue)) {
        message.error('Enter a valid 15-character GSTIN, e.g. 29ABCDE1234F1Z5.');
        return;
      }
      if (panNumber.trim() && panNumber.trim().length !== 10) {
        message.error('PAN, if provided, must be 10 characters.');
        return;
      }
    }
    setCurrentStep((prev) => prev + 1);
  };

  const handlePrev = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    if (!address.trim() || !city.trim() || !state.trim()) {
      message.error('Please complete your shop location details.');
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      message.error('Enter a valid 6-digit pincode.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await registerRetailer({
        phone: cleanPhone(),
        fullName: ownerName.trim(),
        businessName: storeName.trim(),
        email: email.trim() || undefined,
        gstin: gstin.trim().toUpperCase(),
        pan: panNumber.trim() || undefined,
        addressLine: address.trim(),
        city: city.trim(),
        district: district.trim() || undefined,
        state: state.trim(),
        pincode: pincode.trim(),
        code: otpCode.trim(),
        referralCode: referralCode.trim() || undefined,
      });

      setIsCompleted(true);
      message.success(response.message);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Registration could not be submitted. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      backgroundColor: '#f8fafc',
    }}>
      {/* Left side: Form */}
      <div style={{
        flex: '1 1 50%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        padding: '32px 24px',
        maxWidth: '800px',
        margin: '0 auto',
        overflowY: 'auto',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: '32px',
            alignSelf: 'flex-start',
            transition: 'color 0.2s',
            color: '#64748b'
          }}
          onMouseOver={(e) => e.currentTarget.style.color = '#0f172a'}
          onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
        >
          <ArrowLeftOutlined style={{ fontSize: 18 }} />
          <Typography.Text strong style={{ fontSize: 15, color: 'inherit' }}>
            Back
          </Typography.Text>
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '600px', margin: '0 auto' }}>

          <div style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <img src="/images/desi-tokri-cropped.png" alt="Desi Tokri" style={{ height: '48px', marginBottom: '24px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
               <Typography.Title level={2} style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>
                 Become a Partner
               </Typography.Title>
               <div style={{ background: '#fef3c7', color: '#b45309', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                 B2B DIRECT
               </div>
            </div>
            <Typography.Text style={{ color: '#64748b', fontSize: 16 }}>
              Join verified Kiranas & Retailers getting mandi-direct rates.
            </Typography.Text>
          </div>

          <div style={{
            background: '#ffffff',
            borderRadius: 24,
            border: '1px solid #e2e8f0',
            padding: '32px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          }}>
            {isCompleted ? (
              <Result
                status="success"
                title="Registration submitted"
                subTitle={`Thanks — your application for "${storeName}" (GSTIN: ${gstin.trim().toUpperCase()}) is now with our team for review. We verify the GSTIN and business details before activating a store partner account; you'll be able to sign in as soon as it's approved.`}
                extra={[
                  <Button
                    type="primary"
                    key="login"
                    size="large"
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', borderRadius: 12, fontWeight: 600 }}
                    onClick={() => navigate('/retailers/login')}
                  >
                    Back to Sign In
                  </Button>,
                  <Button key="shop" size="large" style={{ borderRadius: 12 }} onClick={() => navigate('/')}>
                    Continue Browsing
                  </Button>,
                ]}
              />
            ) : (
              <div>
                <div style={{ marginBottom: 32 }}>
                  <Steps
                    current={currentStep}
                    size="small"
                    items={[
                      { title: 'Store Details' },
                      { title: 'GST & Compliance' },
                      { title: 'Location' },
                    ]}
                  />
                </div>

                <div style={{ minHeight: '300px' }}>
                  {/* Step 1: Store Details */}
                  {currentStep === 0 && (
                    <div className="fade-in">
                      <Typography.Title level={4} style={{ marginBottom: 24, color: '#0f172a' }}>
                        Store & Proprietor Information
                      </Typography.Title>
                      <Row gutter={[20, 20]}>
                        <Col xs={24} md={12}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            Store / Business Name *
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="e.g. Sri Balaji Provision Store"
                            value={storeName}
                            onChange={(e) => setStoreName(e.target.value)}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                        <Col xs={24} md={12}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            Proprietor Name *
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="e.g. Ramesh Kumar"
                            value={ownerName}
                            onChange={(e) => setOwnerName(e.target.value)}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                        <Col xs={24} md={otpSent ? 12 : 16}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            Mobile Number *
                          </Typography.Text>
                          <Input
                            size="large"
                            prefix={<span style={{ color: '#94a3b8', fontWeight: 600, marginRight: 8 }}>+91</span>}
                            placeholder="10-digit number"
                            value={phone}
                            onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setOtpSent(false); setOtpCode(''); }}
                            maxLength={10}
                            inputMode="numeric"
                            disabled={otpSent}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                        <Col xs={24} md={otpSent ? 12 : 8}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: 'transparent' }}>
                            .
                          </Typography.Text>
                          <Button
                            size="large"
                            loading={sendingOtp}
                            onClick={() => void handleSendOtp()}
                            style={{ width: '100%', borderRadius: 12, height: 48, fontWeight: 600 }}
                          >
                            {otpSent ? 'Resend OTP' : 'Send OTP'}
                          </Button>
                        </Col>
                        {otpSent && (
                          <Col xs={24}>
                            <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                              Enter OTP *
                            </Typography.Text>
                            <Input
                              size="large"
                              placeholder={'•'.repeat(OTP_LENGTH)}
                              value={otpCode}
                              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                              maxLength={OTP_LENGTH}
                              inputMode="numeric"
                              style={{ borderRadius: 12, height: 48, letterSpacing: 6 }}
                            />
                            {devCode && (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Dev OTP: {devCode}
                              </Typography.Text>
                            )}
                          </Col>
                        )}
                        <Col xs={24}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            Business Email
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="store@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                      </Row>
                    </div>
                  )}

                  {/* Step 2: GST & Compliance */}
                  {currentStep === 1 && (
                    <div className="fade-in">
                      <Typography.Title level={4} style={{ marginBottom: 24, color: '#0f172a' }}>
                        GSTIN & Tax Compliance
                      </Typography.Title>
                      <Row gutter={[20, 20]}>
                        <Col xs={24} md={12}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            GSTIN Number (15-Digit) *
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="e.g. 36AABCU9603R1ZM"
                            value={gstin}
                            onChange={(e) => setGstin(e.target.value.toUpperCase().slice(0, 15))}
                            maxLength={15}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                        <Col xs={24} md={12}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            Business PAN (10-Digit)
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="e.g. AABCU9603R"
                            value={panNumber}
                            onChange={(e) => setPanNumber(e.target.value.toUpperCase().slice(0, 10))}
                            maxLength={10}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                        <Col xs={24} md={12}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            Referral Code (optional)
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="Have a partner's code?"
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value.toUpperCase().slice(0, 20))}
                            maxLength={20}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                      </Row>
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px', marginTop: 24 }}>
                        <Typography.Text style={{ color: '#166534', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <CheckCircleFilled style={{ marginTop: 3 }} />
                          Our team verifies your GSTIN before activating your account. We generate 100% compliant B2B GST tax invoices with itemized HSN codes for easy Input Tax Credit.
                        </Typography.Text>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Location */}
                  {currentStep === 2 && (
                    <div className="fade-in">
                      <Typography.Title level={4} style={{ marginBottom: 24, color: '#0f172a' }}>
                        Shop Location Details
                      </Typography.Title>
                      <Row gutter={[20, 20]}>
                        <Col xs={24}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            Complete Street Address *
                          </Typography.Text>
                          <Input.TextArea
                            rows={3}
                            placeholder="Shop Number, Building Name, Market / Street Road"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            style={{ borderRadius: 12 }}
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            City / Town *
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="e.g. Warangal"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            District
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="e.g. Warangal Urban"
                            value={district}
                            onChange={(e) => setDistrict(e.target.value)}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            Pincode *
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="e.g. 506001"
                            value={pincode}
                            onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            maxLength={6}
                            inputMode="numeric"
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                        <Col xs={24} md={12}>
                          <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#475569' }}>
                            State *
                          </Typography.Text>
                          <Input
                            size="large"
                            placeholder="e.g. Telangana"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            style={{ borderRadius: 12, height: 48 }}
                          />
                        </Col>
                      </Row>
                    </div>
                  )}
                </div>

                {/* Navigation Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, paddingTop: 24, borderTop: '1px solid #f1f5f9' }}>
                  {currentStep > 0 ? (
                    <Button size="large" onClick={handlePrev} style={{ borderRadius: 12, height: 48, padding: '0 24px', fontWeight: 600 }}>
                      Back
                    </Button>
                  ) : (
                    <div />
                  )}

                  {currentStep < 2 ? (
                    <Button
                      type="primary"
                      size="large"
                      onClick={handleNext}
                      style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: 'none', borderRadius: 12, fontWeight: 600, height: 48, padding: '0 32px' }}
                    >
                      Next Step &rarr;
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      size="large"
                      loading={submitting}
                      onClick={() => void handleSubmit()}
                      style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', border: 'none', borderRadius: 12, fontWeight: 600, height: 48, padding: '0 32px' }}
                    >
                      Submit for Review
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {!isCompleted && (
             <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Typography.Text style={{ color: '#64748b' }}>
                  Already a registered partner? <Link to="/retailers/login" style={{ color: '#f97316', fontWeight: 600 }}>Sign in instead</Link>
                </Typography.Text>
             </div>
          )}

        </div>
      </div>

      {/* Right side: Image (hidden on mobile) */}
      <div className="login-image-section" style={{
        flex: '1 1 50%',
        display: 'none',
        position: 'relative',
        background: '#f97316',
        overflow: 'hidden',
      }}>
        <img
          src="https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&q=80"
          alt="Retail Store Setup"
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
        />
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(to top, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.1) 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '64px',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            padding: '24px',
            borderRadius: '24px',
            border: '1px solid rgba(255,255,255,0.2)',
            maxWidth: '480px'
          }}>
            <ShopOutlined style={{ fontSize: 32, color: '#f97316', marginBottom: 16 }} />
            <Typography.Title level={3} style={{ color: '#fff', margin: '0 0 12px 0', fontWeight: 700 }}>
              Up to 20% Wholesale Margin
            </Typography.Title>
            <Typography.Text style={{ color: '#cbd5e1', fontSize: 16, lineHeight: 1.6 }}>
              Join the network of top retailers getting direct mill prices, next-day dispatch, and 15-day flexible credit lines.
            </Typography.Text>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 992px) {
          .login-image-section {
            display: flex !important;
          }
        }
        .fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Override Ant Design Select global height issue if any */
        .ant-select-selector {
           border-radius: 12px !important;
        }
      `}</style>
    </div>
  );
}
