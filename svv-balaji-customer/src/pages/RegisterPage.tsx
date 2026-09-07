import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  FileProtectOutlined,
  IdcardOutlined,
  SafetyCertificateFilled,
  ShopOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Radio,
  Result,
  Row,
  Select,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';

export function RegisterPage() {
  const navigate = useNavigate();
  const { registerPartner, role } = useCustomerAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Form State
  const [storeName, setStoreName] = useState('Sri Balaji Provision Store');
  const [ownerName, setOwnerName] = useState('Ramesh Kumar');
  const [phone, setPhone] = useState('9876543210');
  const [email, setEmail] = useState('ramesh.balaji@example.com');
  const [category, setCategory] = useState('Kirana & General Store');
  const [gstin, setGstin] = useState('36AABCU9603R1ZM');
  const [panNumber, setPanNumber] = useState('AABCU9603R');
  const [fssai, setFssai] = useState('13624014000189');
  const [address, setAddress] = useState('Shop #14, Main Market, Hanamkonda');
  const [city, setCity] = useState('Warangal');
  const [pincode, setPincode] = useState('506001');
  const [state, setState] = useState('Telangana');

  const handleNext = () => {
    if (currentStep === 0) {
      if (!storeName.trim() || !ownerName.trim() || !phone.trim()) {
        message.error('Please complete all required shop and contact fields.');
        return;
      }
    } else if (currentStep === 1) {
      if (!gstin.trim() || !panNumber.trim()) {
        message.error('Please enter your GSTIN and PAN number.');
        return;
      }
    }
    setCurrentStep((prev) => prev + 1);
  };

  const handlePrev = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const handleSubmit = () => {
    if (!address.trim() || !pincode.trim()) {
      message.error('Please enter complete shop location details.');
      return;
    }

    // Register partner in context
    registerPartner({
      storeName,
      ownerName,
      phone: phone.startsWith('+91') ? phone : `+91 ${phone}`,
      email,
      gstin,
      panNumber,
      category,
      address: `${address}, ${city}, ${state} - ${pincode}`,
      pincode,
    });

    setIsCompleted(true);
    message.success('Wholesale Retailer Account Approved & Activated!');
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 120px)', background: '#f8fafc', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        {/* Desktop Breadcrumb */}
        <div className="desktop-only" style={{ marginBottom: 16 }}>
          <Breadcrumb
            items={[
              { title: <Link to="/">Home</Link> },
              { title: <Link to="/login">Sign In</Link> },
              { title: 'Become a Partner' },
            ]}
          />
        </div>

        {/* Mobile top back bar */}
        <div className="mobile-only" style={{ marginBottom: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <ArrowLeftOutlined style={{ fontSize: 18, color: '#475569' }} />
            <Typography.Text strong style={{ fontSize: 15, color: '#334155' }}>
              Back
            </Typography.Text>
          </button>
        </div>

        {/* Hero Banner Card */}
        <div
          style={{
            background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
            borderRadius: 20,
            padding: '28px 32px',
            color: '#fff',
            marginBottom: 24,
            boxShadow: '0 4px 14px rgba(234, 88, 12, 0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <Tag color="gold" style={{ fontWeight: 700, borderRadius: 12, marginBottom: 8, padding: '2px 10px' }}>
                B2B DIRECT MILL SUPPLY
              </Tag>
              <Typography.Title level={2} style={{ color: '#fff', margin: 0, fontWeight: 800 }}>
                Become a Partner / Buy Wholesale
              </Typography.Title>
              <Typography.Text style={{ color: '#ffedd5', fontSize: 14, marginTop: 4, display: 'block' }}>
                Join 4,500+ verified Kiranas & Retailers getting mandi-direct rates, GST invoices, and 15-day credit lines.
              </Typography.Text>
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(6px)',
                borderRadius: 14,
                padding: '12px 18px',
                textAlign: 'center',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              <Typography.Text strong style={{ color: '#fff', fontSize: 20, display: 'block' }}>
                Up to 20%
              </Typography.Text>
              <Typography.Text style={{ color: '#ffedd5', fontSize: 12 }}>Wholesale Margin</Typography.Text>
            </div>
          </div>
        </div>

        {/* Onboarding Form Card */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
            padding: '28px 24px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          }}
        >
          {isCompleted ? (
            <Result
              status="success"
              title="Welcome to Desi Tokri Wholesale Partner Network!"
              subTitle={`Your store "${storeName}" (GSTIN: ${gstin}) is now fully verified. Your account is credited with ₹500 welcome wallet balance and ₹50,000 credit limit.`}
              extra={[
                <Button
                  type="primary"
                  key="profile"
                  size="large"
                  style={{ background: '#f97316', borderColor: '#f97316', borderRadius: 8, fontWeight: 600 }}
                  onClick={() => navigate('/profile')}
                >
                  Go to Retailer Dashboard
                </Button>,
                <Button key="shop" size="large" style={{ borderRadius: 8 }} onClick={() => navigate('/products/atta-dal')}>
                  Browse Wholesale Catalog
                </Button>,
              ]}
            />
          ) : (
            <div>
              {/* Stepper */}
              <div style={{ marginBottom: 32 }}>
                <Steps
                  current={currentStep}
                  items={[
                    { title: 'Store Details' },
                    { title: 'GST & Compliance' },
                    { title: 'Location & Delivery' },
                  ]}
                />
              </div>

              {/* Step 1: Store Details */}
              {currentStep === 0 && (
                <div>
                  <Typography.Title level={4} style={{ marginBottom: 16, color: '#0f172a' }}>
                    1. Store & Proprietor Information
                  </Typography.Title>

                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Store / Business Name *
                      </Typography.Text>
                      <Input
                        size="large"
                        placeholder="e.g. Sri Balaji Provision Store"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Proprietor / Owner Name *
                      </Typography.Text>
                      <Input
                        size="large"
                        placeholder="e.g. Ramesh Kumar"
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Registered Mobile Number *
                      </Typography.Text>
                      <Input
                        size="large"
                        prefix="+91"
                        placeholder="10-digit number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Business Email Address
                      </Typography.Text>
                      <Input
                        size="large"
                        placeholder="store@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Store Business Type *
                      </Typography.Text>
                      <Select
                        size="large"
                        value={category}
                        onChange={(val) => setCategory(val)}
                        style={{ width: '100%' }}
                        options={[
                          { label: '🏪 Kirana & General Provision Store', value: 'Kirana & General Store' },
                          { label: '🏬 Supermarket / Mini Mart', value: 'Supermarket' },
                          { label: '🍽️ Restaurant / Hotel / Caterer (HoReCa)', value: 'HoReCa' },
                          { label: '📦 Wholesale Stockist & Trader', value: 'Wholesaler' },
                        ]}
                      />
                    </Col>
                  </Row>
                </div>
              )}

              {/* Step 2: GST & Tax Compliance */}
              {currentStep === 1 && (
                <div>
                  <Typography.Title level={4} style={{ marginBottom: 16, color: '#0f172a' }}>
                    2. GSTIN & Tax Compliance Verification
                  </Typography.Title>

                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                    <Typography.Text style={{ color: '#166534', fontSize: 13 }}>
                      ✓ <strong>Input Tax Credit:</strong> We generate 100% compliant B2B GST tax invoices with itemized HSN codes and GST breakup for every consignment.
                    </Typography.Text>
                  </div>

                  <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        GSTIN Number (15-Digit) *
                      </Typography.Text>
                      <Input
                        size="large"
                        placeholder="e.g. 36AABCU9603R1ZM"
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value.toUpperCase())}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Business PAN Number (10-Digit) *
                      </Typography.Text>
                      <Input
                        size="large"
                        placeholder="e.g. AABCU9603R"
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        FSSAI License Number (Optional)
                      </Typography.Text>
                      <Input
                        size="large"
                        placeholder="14-digit FSSAI number"
                        value={fssai}
                        onChange={(e) => setFssai(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={12}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Trade License / Shop Certificate (Mock Upload)
                      </Typography.Text>
                      <Button icon={<UploadOutlined />} size="large" style={{ width: '100%', borderRadius: 8 }}>
                        Upload Certificate / Photo
                      </Button>
                    </Col>
                  </Row>
                </div>
              )}

              {/* Step 3: Location & Delivery */}
              {currentStep === 2 && (
                <div>
                  <Typography.Title level={4} style={{ marginBottom: 16, color: '#0f172a' }}>
                    3. Shop Location & Morning Dispatch Hub
                  </Typography.Title>

                  <Row gutter={[16, 16]}>
                    <Col xs={24}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Shop Complete Street Address *
                      </Typography.Text>
                      <Input.TextArea
                        rows={2}
                        placeholder="Shop Number, Building Name, Market / Street Road"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        City / Town *
                      </Typography.Text>
                      <Input
                        size="large"
                        placeholder="e.g. Warangal"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        Pincode *
                      </Typography.Text>
                      <Input
                        size="large"
                        placeholder="e.g. 506001"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                        State *
                      </Typography.Text>
                      <Input
                        size="large"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        style={{ borderRadius: 8 }}
                      />
                    </Col>
                  </Row>

                  <div style={{ marginTop: 24, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '16px 20px' }}>
                    <Typography.Text strong style={{ color: '#9a3412', display: 'block', marginBottom: 4 }}>
                      ⚡ Instant Auto-Approval for Demo
                    </Typography.Text>
                    <Typography.Text style={{ color: '#c2410c', fontSize: 13 }}>
                      Upon submission, your store will immediately be approved as an active wholesale retailer with ₹50,000 credit line.
                    </Typography.Text>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, paddingTop: 20, borderTop: '1px solid #f1f5f9' }}>
                {currentStep > 0 ? (
                  <Button size="large" onClick={handlePrev} style={{ borderRadius: 8 }}>
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
                    style={{ background: '#f97316', borderColor: '#f97316', borderRadius: 8, fontWeight: 600, minWidth: 140 }}
                  >
                    Next Step &rarr;
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size="large"
                    onClick={handleSubmit}
                    style={{ background: '#16a34a', borderColor: '#16a34a', borderRadius: 8, fontWeight: 600, minWidth: 160 }}
                  >
                    Submit & Activate Partner
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
