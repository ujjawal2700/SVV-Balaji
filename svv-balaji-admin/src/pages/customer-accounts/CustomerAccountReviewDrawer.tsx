import {
  CheckCircleFilled,
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Input,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import type { CustomerAccount } from '@shared/api/types';
import { useApproveCustomerAccount, useRejectCustomerAccount } from '@shared/hooks/useCustomerAccounts';
import { EM_DASH, formatDateTime } from '@shared/utils/format';

const { Text, Title } = Typography;

/**
 * Super Admin Retailer Registration Verification & Approval Vault Drawer
 * Displays every field collected during retailer self-service registration.
 */
export function CustomerAccountReviewDrawer({
  account,
  onClose,
}: {
  account: CustomerAccount | null;
  onClose: () => void;
}) {
  const { message, modal } = AntApp.useApp();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const approve = useApproveCustomerAccount();
  const reject = useRejectCustomerAccount();

  const close = () => {
    setRejecting(false);
    setReason('');
    onClose();
  };

  if (!account) return null;

  const handleApprove = () => {
    modal.confirm({
      title: `Approve Retailer Partner: ${account.businessName || account.fullName}?`,
      content: `This activates the B2B account, creates commercial customer record, and enables direct wholesale ordering under GSTIN ${account.gstin || 'N/A'}.`,
      okText: 'Approve & Activate',
      okButtonProps: { type: 'primary', style: { background: '#16a34a', borderColor: '#16a34a' } },
      onOk: async () => {
        try {
          await approve.mutateAsync(account.id);
          message.success(`Retailer partner "${account.businessName || account.fullName}" approved & activated!`);
          close();
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not approve this registration'), 8);
        }
      },
    });
  };

  const handleReject = async () => {
    if (!reason.trim()) {
      message.error('Please provide a reason for rejecting this registration');
      return;
    }
    try {
      await reject.mutateAsync({ id: account.id, input: { reason: reason.trim() } });
      message.success('Retailer registration rejected');
      close();
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not reject this registration'), 8);
    }
  };

  const fullLocation = [account.addressLine, account.city, account.district, account.state, account.pincode]
    .filter(Boolean)
    .join(', ');

  return (
    <Drawer
      open={Boolean(account)}
      onClose={close}
      width={680}
      title={
        <Space align="center" size={12}>
          <ShopOutlined style={{ color: '#f97316', fontSize: 20 }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {account.businessName || account.fullName}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Retailer Approval & Verification Audit
            </Text>
          </div>
        </Space>
      }
      extra={
        <Tag color={account.status === 'PENDING_APPROVAL' ? 'gold' : account.status === 'ACTIVE' ? 'green' : 'red'}>
          {account.status.replace('_', ' ')}
        </Tag>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Banner Alert for Pending Approvals */}
        {account.status === 'PENDING_APPROVAL' && (
          <Alert
            type="warning"
            showIcon
            message="Awaiting Super Admin Approval"
            description="Review shop details, GSTIN compliance, and physical address below before activating B2B wholesale ordering."
          />
        )}

        {/* 1. Store & Proprietor Profile */}
        <Card
          size="small"
          title={
            <Space>
              <UserOutlined style={{ color: '#1677ff' }} />
              <span>1. Store & Proprietor Information</span>
            </Space>
          }
          style={{ borderRadius: 8 }}
        >
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Store / Business Name" span={2}>
              <Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                {account.businessName || EM_DASH}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Proprietor Name">
              <Text strong>{account.fullName}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Channel Category">
              <Tag color={account.channel === 'B2B' ? 'blue' : 'purple'}>
                {account.channel === 'B2B' ? 'B2B Retail Partner' : 'B2C Shopper'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Mobile Phone">
              <Space>
                <Text code>+91 {account.phone}</Text>
                {account.phoneVerifiedAt ? (
                  <Tag color="success" icon={<CheckCircleFilled />}>
                    OTP Verified
                  </Tag>
                ) : (
                  <Tag color="warning">Unverified</Tag>
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Business Email">
              {account.email ? <Text copyable>{account.email}</Text> : EM_DASH}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 2. GSTIN & Tax Compliance */}
        <Card
          size="small"
          title={
            <Space>
              <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
              <span>2. GSTIN & Tax Compliance Audit</span>
            </Space>
          }
          style={{ borderRadius: 8, background: '#f6ffed', borderColor: '#b7eb8f' }}
        >
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="GSTIN Number (15-Digit)">
              {account.gstin ? (
                <Space>
                  <Text code style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                    {account.gstin}
                  </Text>
                  <Tag color="green">GST Validated</Tag>
                </Space>
              ) : (
                <Text type="secondary">Not Provided</Text>
              )}
            </Descriptions.Item>

            <Descriptions.Item label="Business PAN (10-Digit)">
              {account.pan ? <Text code style={{ fontWeight: 600 }}>{account.pan}</Text> : EM_DASH}
            </Descriptions.Item>

            <Descriptions.Item label="Signup Referral Code" span={2}>
              {account.referralCode ? (
                <Space>
                  <Tag color="orange" style={{ fontWeight: 700 }}>
                    {account.referralCode}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    (Applied during registration)
                  </Text>
                </Space>
              ) : (
                <Text type="secondary">Direct Organic Registration (No referral code)</Text>
              )}
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginTop: 12, padding: '10px 14px', background: '#ffffff', borderRadius: 8, border: '1px solid #d9f7be' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              ✔ <strong>Tax Invoice Status:</strong> Approved partner will receive 100% GST-compliant invoices with HSN codes & Input Tax Credit (ITC) eligibility.
            </Text>
          </div>
        </Card>

        {/* 3. Shop Location Details */}
        <Card
          size="small"
          title={
            <Space>
              <EnvironmentOutlined style={{ color: '#fa8c16' }} />
              <span>3. Physical Shop Location Details</span>
            </Space>
          }
          style={{ borderRadius: 8 }}
        >
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Complete Street Address" span={2}>
              <Text>{account.addressLine || EM_DASH}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="City / Town">{account.city || EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="District">{account.district || EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="State">{account.state || EM_DASH}</Descriptions.Item>
            <Descriptions.Item label="Pincode">
              {account.pincode ? <Tag color="blue">{account.pincode}</Tag> : EM_DASH}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 4. Timeline & Customer Record */}
        <Card
          size="small"
          title={
            <Space>
              <IdcardOutlined style={{ color: '#722ed1' }} />
              <span>4. Account Timeline & Commercial Link</span>
            </Space>
          }
          style={{ borderRadius: 8 }}
        >
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Registration Submitted">{formatDateTime(account.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Phone Verified At">{formatDateTime(account.phoneVerifiedAt)}</Descriptions.Item>
            <Descriptions.Item label="Last Login Activity">{formatDateTime(account.lastLoginAt)}</Descriptions.Item>
            <Descriptions.Item label="Commercial Customer ID">
              {account.customer ? (
                <Tag color="cyan">{account.customer.customerCode}</Tag>
              ) : (
                <Text type="secondary">Generated on Approval</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Rejection Alert if REJECTED */}
        {account.status === 'REJECTED' && account.rejectionReason && (
          <Alert
            type="error"
            showIcon
            message="Application Rejected"
            description={account.rejectionReason}
          />
        )}

        {/* Approval / Rejection Action Suite */}
        {account.status === 'PENDING_APPROVAL' && (
          <div style={{ marginTop: 8, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            {rejecting ? (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Text strong style={{ color: '#cf1322' }}>
                  Specify Reason for Rejection (Shown to applicant):
                </Text>
                <Input.TextArea
                  rows={3}
                  placeholder="e.g. Invalid GSTIN number format or address unverified on GST portal..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                  <Button onClick={() => setRejecting(false)}>Cancel</Button>
                  <Button
                    danger
                    type="primary"
                    disabled={!reason.trim()}
                    loading={reject.isPending}
                    onClick={handleReject}
                  >
                    Confirm Rejection
                  </Button>
                </Space>
              </Space>
            ) : (
              <Row gutter={12}>
                <Col span={14}>
                  <Button
                    type="primary"
                    block
                    size="large"
                    icon={<CheckOutlined />}
                    loading={approve.isPending}
                    onClick={handleApprove}
                    style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', border: 'none', borderRadius: 8, fontWeight: 700 }}
                  >
                    Approve & Activate Retailer
                  </Button>
                </Col>
                <Col span={10}>
                  <Button
                    danger
                    block
                    size="large"
                    icon={<CloseOutlined />}
                    onClick={() => setRejecting(true)}
                    style={{ borderRadius: 8, fontWeight: 600 }}
                  >
                    Reject Application
                  </Button>
                </Col>
              </Row>
            )}
          </div>
        )}
      </Space>
    </Drawer>
  );
}
