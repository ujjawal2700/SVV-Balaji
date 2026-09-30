import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ClockCircleFilled,
  DisconnectOutlined,
  IdcardOutlined,
  LoadingOutlined,
  MailOutlined,
  PhoneOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Result, Row, Space, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { storefrontAuthApi } from '../api/storefrontAuth';

const { Title, Text, Paragraph } = Typography;

export function UnderReviewPage() {
  const navigate = useNavigate();
  const { retailerProfile, logout, refreshProfile } = useCustomerAuth();
  const [checking, setChecking] = useState(false);

  // Auto-redirect if profile becomes VERIFIED
  useEffect(() => {
    if (retailerProfile?.kycStatus === 'VERIFIED') {
      message.success('🎉 Your retailer account has been approved by Super Admin!');
      navigate('/', { replace: true });
    }
  }, [retailerProfile?.kycStatus, navigate]);

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      if (refreshProfile) {
        await refreshProfile();
      } else {
        await storefrontAuthApi.me();
      }
      message.info('Account status updated');
    } catch {
      message.error('Could not check account status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #fefce8 0%, #fff7ed 50%, #f0fdf4 100%)',
        padding: '32px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ maxWidth: 680, width: '100%' }}>
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/images/desi-tokri-cropped.png" alt="Desi Tokri" style={{ height: 48, marginBottom: 16 }} />
        </div>

        {/* Main Status Hero Card */}
        <Card
          style={{
            borderRadius: 16,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #fde68a',
            overflow: 'hidden',
          }}
        >
          {/* Top Banner */}
          <div
            style={{
              background: 'linear-gradient(90deg, #d97706 0%, #ea580c 100%)',
              padding: '20px 24px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '-24px -24px 24px -24px',
            }}
          >
            <Space align="center" size={12}>
              <ClockCircleFilled style={{ fontSize: 24, color: '#fef08a' }} />
              <div>
                <Title level={4} style={{ color: '#ffffff', margin: 0 }}>
                  Retailer Account Under Review
                </Title>
                <Text style={{ color: '#fef3c7', fontSize: 13 }}>
                  Verification in progress by SVV Balaji Super Admin
                </Text>
              </div>
            </Space>
            <Tag color="gold" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 12, fontWeight: 600 }}>
              PENDING APPROVAL
            </Tag>
          </div>

          {/* Body Content */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Result
              icon={<ClockCircleOutlined style={{ color: '#d97706', fontSize: 54 }} />}
              title={
                <span style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
                  Welcome, {retailerProfile?.ownerName || 'Partner'}!
                </span>
              }
              subTitle={
                <div style={{ maxWidth: 520, margin: '0 auto', color: '#475569', fontSize: 15, lineHeight: 1.6 }}>
                  Your business profile for{' '}
                  <strong style={{ color: '#0f172a' }}>{retailerProfile?.storeName || 'your store'}</strong> has been
                  submitted successfully. You remain logged in while our Super Admin team reviews your GSTIN and store
                  credentials.
                </div>
              }
            />

            {/* Real-time Indicator Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#fef3c7',
                border: '1px solid #fde68a',
                padding: '6px 16px',
                borderRadius: 20,
                color: '#92400e',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 24,
              }}
            >
              <LoadingOutlined spin style={{ color: '#d97706' }} />
              <span>Checking approval status automatically in real time…</span>
            </div>
          </div>

          {/* Submitted Profile Audit Box */}
          <Card
            type="inner"
            title={
              <Space>
                <ShopOutlined style={{ color: '#ea580c' }} />
                <span>Submitted Registration Details</span>
              </Space>
            }
            style={{ borderRadius: 12, background: '#fff9eb', borderColor: '#fef3c7', marginBottom: 24 }}
          >
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
              <Descriptions.Item label="Store / Business">
                <Text strong>{retailerProfile?.storeName || '—'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Proprietor Name">
                <Text strong>{retailerProfile?.ownerName || '—'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Registered Phone">
                <Text code>{retailerProfile?.phone || '—'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Business Email">
                {retailerProfile?.email ? (
                  <Space size={4}>
                    <MailOutlined style={{ color: '#16a34a' }} />
                    <Text copyable={{ text: retailerProfile.email }}>
                      {retailerProfile.email}
                    </Text>
                  </Space>
                ) : (
                  <Text type="secondary">Not provided</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="GSTIN Number">
                <Text code style={{ color: '#d97706', fontWeight: 700 }}>
                  {retailerProfile?.gstin || '—'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Location">
                {retailerProfile?.address || '—'} ({retailerProfile?.pincode})
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Bottom Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Button
              type="default"
              icon={<DisconnectOutlined />}
              onClick={() => {
                logout();
                navigate('/retailers/login', { replace: true });
              }}
            >
              Sign Out
            </Button>
            <Button
              type="primary"
              icon={checking ? <LoadingOutlined spin /> : <ReloadOutlined />}
              loading={checking}
              onClick={handleManualCheck}
              style={{ background: '#d97706', borderColor: '#d97706' }}
            >
              Check Approval Status
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
