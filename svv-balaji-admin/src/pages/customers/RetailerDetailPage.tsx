import {
  ArrowLeftOutlined,
  BankOutlined,
  CheckCircleFilled,
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  CreditCardOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  HeartOutlined,
  IdcardOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  ShoppingOutlined,
  UserOutlined,
  WalletOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Progress,
  Rate,
  Result,
  Row,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import type { CustomerStatus } from '../../api/types';
import { Can } from '../../components/Can';
import {
  useApproveCustomerAccount,
  useCustomerAccount,
  useRejectCustomerAccount,
} from '@shared/hooks/useCustomerAccounts';
import {
  useCustomer,
  useCustomerCredit,
  useCustomerReviews,
  useCustomerSupportTickets,
  useCustomerWallet,
  useCustomerWishlist,
  useSetCustomerStatus,
} from '@shared/hooks/useCustomers';
import { useOrders } from '@shared/hooks/useSales';
import { EM_DASH, formatCurrency, formatDateTime } from '../../utils/format';
import { CustomerCreditDrawer } from './CustomerCreditDrawer';
import { CustomerFormModal } from './CustomerFormModal';
import { InfoRow, StatCard } from './detailPageParts';

const { Text } = Typography;

const STATUS_ACTIONS: Record<CustomerStatus, { next: CustomerStatus; label: string; warning?: string }[]> = {
  ACTIVE: [
    { next: 'INACTIVE', label: 'Deactivate', warning: 'No new orders can be raised. Orders already in flight are unaffected.' },
    { next: 'BLACKLISTED', label: 'Blacklist', warning: 'No new orders, and the account is flagged everywhere it appears.' },
  ],
  INACTIVE: [{ next: 'ACTIVE', label: 'Reactivate' }],
  BLACKLISTED: [{ next: 'ACTIVE', label: 'Remove blacklist' }],
};

/**
 * Unified Retailer / B2B Account & Profile Console.
 * Combines registration approval audit (Vault), commercial profile, tax & credit settings,
 * order history, wallet balance, and support interactions into a single comprehensive page.
 */
export function RetailerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();

  const [formOpen, setFormOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  // 1. Load CustomerAccount (Registration Vault)
  const accountQuery = useCustomerAccount(id);
  const account = accountQuery.data ?? null;

  const approve = useApproveCustomerAccount();
  const reject = useRejectCustomerAccount();

  // 2. Load Customer Profile
  const effectiveCustomerId = account?.customerId || (accountQuery.isFetched && !account ? id : undefined);
  const customerQuery = useCustomer(effectiveCustomerId);
  const customer = customerQuery.data ?? null;
  const setStatusMutation = useSetCustomerStatus();

  // Target Customer ID for related sub-queries
  const targetCustId = customer?.id || account?.customerId || undefined;

  const creditQuery = useCustomerCredit(targetCustId, true);
  const creditData = creditQuery.data;

  const walletQuery = useCustomerWallet(targetCustId);
  const walletData = walletQuery.data;

  const ticketsQuery = useCustomerSupportTickets(targetCustId);
  const supportTickets = ticketsQuery.data ?? [];

  const wishlistQuery = useCustomerWishlist(targetCustId);
  const wishlistItems = wishlistQuery.data ?? [];

  const reviewsQuery = useCustomerReviews(targetCustId);
  const reviews = reviewsQuery.data ?? [];

  const ordersQuery = useOrders(targetCustId ? { customerId: targetCustId } : { customerId: '__none__' });
  const orders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);

  const totalBusinessValue = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.total), 0),
    [orders],
  );

  const handleApprove = () => {
    if (!account) return;
    modal.confirm({
      title: `Approve Retailer Partner: ${account.businessName || account.fullName}?`,
      content: `This activates the B2B account, creates a commercial customer record, and enables direct wholesale ordering under GSTIN ${account.gstin || 'N/A'}.`,
      okText: 'Approve & Activate',
      okButtonProps: { type: 'primary', style: { background: '#16a34a', borderColor: '#16a34a' } },
      onOk: async () => {
        try {
          await approve.mutateAsync(account.id);
          message.success(`Retailer partner "${account.businessName || account.fullName}" approved & activated!`);
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not approve this registration'), 8);
        }
      },
    });
  };

  const handleReject = async () => {
    if (!account) return;
    if (!reason.trim()) {
      message.error('Please provide a reason for rejecting this registration');
      return;
    }
    try {
      await reject.mutateAsync({ id: account.id, input: { reason: reason.trim() } });
      message.success('Retailer registration rejected');
      setRejecting(false);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Could not reject this registration'), 8);
    }
  };

  const handleStatusChange = (next: CustomerStatus, warning?: string) => {
    if (!customer) return;
    modal.confirm({
      title: `${next === 'ACTIVE' ? 'Reactivate' : next === 'INACTIVE' ? 'Deactivate' : 'Blacklist'} ${customer.name}?`,
      content: warning ?? 'The account becomes available for new orders again.',
      okText: 'Confirm',
      okButtonProps: { danger: next === 'BLACKLISTED' },
      onOk: async () => {
        try {
          await setStatusMutation.mutateAsync({ id: customer.id, status: next });
          message.success(`Status for ${customer.name} updated to ${next.toLowerCase()}`);
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not change account status'), 8);
        }
      },
    });
  };

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    message.success(`${label} copied to clipboard`);
  };

  if (accountQuery.isLoading || customerQuery.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" tip="Loading B2B Account Details..." />
      </div>
    );
  }

  if (!account && !customer) {
    return (
      <Card style={{ marginTop: 24, borderRadius: 16 }}>
        <Result
          status="404"
          title="Retailer Account Not Found"
          subTitle={`No retailer application or customer record matches the requested ID (${id || ''}).`}
          extra={
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/b2b-accounts')} style={{ borderRadius: 8 }}>
              Back to Retailer Accounts
            </Button>
          }
        />
      </Card>
    );
  }

  // Unified field extractors
  const businessName = account?.businessName || customer?.name || account?.fullName || 'B2B Retailer';
  const proprietorName = account?.fullName || customer?.contactName || EM_DASH;
  const phone = account?.phone || customer?.phone || '';
  const email = account?.email || customer?.email || '';
  const gstin = account?.gstin || customer?.gstin || null;
  const pan = account?.pan || null;
  const status = account?.status || customer?.status || 'PENDING_APPROVAL';
  const customerCode = customer?.customerCode || account?.customer?.customerCode || null;

  const limit = creditData?.creditLimit ?? (customer?.creditLimit ? Number(customer.creditLimit) : null);
  const outstanding = creditData?.outstanding ?? 0;
  const utilization = limit ? Math.min(100, Math.round((outstanding / limit) * 100)) : null;
  const memberSince = customer?.createdAt ? dayjs(customer.createdAt).format('MMM YYYY').toUpperCase() : null;

  return (
    <div style={{ padding: '16px 8px 32px 8px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        {/* Top Header Card */}
        <div className="page-card" style={{ padding: '20px 24px', borderRadius: 16 }}>
          <Row gutter={[16, 16]} align="middle" justify="space-between">
            <Col>
              <Space size={16} align="center">
                <Button
                  shape="circle"
                  icon={<ArrowLeftOutlined style={{ fontSize: 16, color: '#475569' }} />}
                  onClick={() => navigate('/b2b-accounts')}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    width: 42,
                    height: 42,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                  }}
                />

                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: status === 'PENDING_APPROVAL' ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    boxShadow: status === 'PENDING_APPROVAL' ? '0 4px 12px rgba(249, 115, 22, 0.25)' : '0 4px 12px rgba(15, 23, 42, 0.2)',
                  }}
                >
                  <ShopOutlined />
                </div>

                <Space direction="vertical" size={2}>
                  <Space align="center" size={10} style={{ flexWrap: 'wrap' }}>
                    <Text className="page-title" style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
                      {businessName}
                    </Text>
                    <Tag
                      className={`page-pill page-pill--${
                        status === 'ACTIVE' ? 'green' : status === 'PENDING_APPROVAL' ? 'orange' : status === 'REJECTED' || status === 'BLACKLISTED' ? 'red' : 'slate'
                      }`}
                    >
                      {status ? status.replace('_', ' ') : 'B2B PARTNER'}
                    </Tag>
                    {gstin && (
                      <Tag color="green" style={{ borderRadius: 6, fontWeight: 600 }}>
                        GSTIN: {gstin}
                      </Tag>
                    )}
                  </Space>
                  <Text type="secondary" className="page-meta">
                    {customerCode ? `PARTNER ID: #${customerCode} • ` : ''}PROPRIETOR: {proprietorName} • PHONE: +91 {phone}
                    {memberSince ? ` • PARTNER SINCE ${memberSince}` : ''}
                  </Text>
                </Space>
              </Space>
            </Col>

            <Col>
              <Space size={10} style={{ flexWrap: 'wrap' }}>
                {account?.status === 'PENDING_APPROVAL' && (
                  <>
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={approve.isPending}
                      onClick={handleApprove}
                      style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', border: 'none', borderRadius: 8, fontWeight: 700 }}
                    >
                      Approve &amp; Activate
                    </Button>
                    <Button
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => setRejecting(true)}
                      style={{ borderRadius: 8, fontWeight: 600 }}
                    >
                      Reject Application
                    </Button>
                  </>
                )}
                {customer && (
                  <>
                    <Button icon={<CreditCardOutlined />} onClick={() => setCreditOpen(true)} style={{ borderRadius: 8 }}>
                      Manage Credit
                    </Button>
                    <Can do="CUSTOMER_EDIT">
                      <Button icon={<EditOutlined />} onClick={() => setFormOpen(true)} style={{ borderRadius: 8 }}>
                        Edit Profile
                      </Button>
                    </Can>
                    <Can do="CUSTOMER_STATUS">
                      {STATUS_ACTIONS[customer.status]?.map((action) => (
                        <Button
                          key={action.next}
                          danger={action.next === 'BLACKLISTED'}
                          onClick={() => handleStatusChange(action.next, action.warning)}
                          style={{ borderRadius: 8 }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Can>
                  </>
                )}
              </Space>
            </Col>
          </Row>
        </div>

        {/* Pending Approval Alert Banner */}
        {account?.status === 'PENDING_APPROVAL' && (
          <Alert
            type="warning"
            showIcon
            message="Awaiting Super Admin Verification & Approval"
            description="Inspect registration details, GSTIN compliance, and physical store address in the Vault tab below before enabling wholesale ordering."
          />
        )}

        {/* Rejected Alert Banner */}
        {account?.status === 'REJECTED' && account.rejectionReason && (
          <Alert type="error" showIcon message="Application Rejected" description={`Reason: ${account.rejectionReason}`} />
        )}

        {/* Quick Overview Stat Cards (if customer is active or orders exist) */}
        {customer && (
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={6}>
              <StatCard icon={<ShoppingOutlined style={{ fontSize: 18 }} />} tone="slate" label="TOTAL ORDERS" value={orders.length} />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard
                icon={<WalletOutlined style={{ fontSize: 18 }} />}
                tone="green"
                label="TOTAL BUSINESS VALUE"
                value={formatCurrency(totalBusinessValue)}
              />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard
                icon={<CreditCardOutlined style={{ fontSize: 18 }} />}
                tone="red"
                label="OUTSTANDING CREDIT"
                value={formatCurrency(outstanding)}
              />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard
                icon={<CreditCardOutlined style={{ fontSize: 18 }} />}
                tone="blue"
                label="AVAILABLE CREDIT"
                value={creditData?.availableCredit != null ? formatCurrency(creditData.availableCredit) : 'No Limit Set'}
              />
            </Col>
          </Row>
        )}

        {/* Rejection input area if rejecting */}
        {rejecting && account?.status === 'PENDING_APPROVAL' && (
          <Card style={{ borderRadius: 12, borderColor: '#fca5a5', background: '#fff5f5' }}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Text strong style={{ color: '#cf1322', fontSize: 14 }}>
                Specify Reason for Rejection (Visible to Applicant):
              </Text>
              <Input.TextArea
                rows={3}
                placeholder="e.g. Invalid GSTIN number format or address unverified on GST portal..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setRejecting(false)}>Cancel</Button>
                <Button danger type="primary" disabled={!reason.trim()} loading={reject.isPending} onClick={handleReject}>
                  Confirm Rejection
                </Button>
              </Space>
            </Space>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Card bodyStyle={{ padding: '20px 24px' }} className="page-card">
          <Tabs
            defaultActiveKey="vault"
            items={[
              {
                key: 'vault',
                label: (
                  <Space size={6}>
                    <SafetyCertificateOutlined />
                    <span>REGISTRATION &amp; AUDIT VAULT</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 12 }}>
                    {/* 1. Store & Proprietor Profile */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <UserOutlined style={{ color: '#1677ff' }} />
                          <span>1. Store &amp; Proprietor Information</span>
                        </Space>
                      }
                      className="page-card"
                    >
                      <Descriptions column={2} bordered size="small">
                        <Descriptions.Item label="Store / Business Name" span={2}>
                          <Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                            {businessName}
                          </Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Proprietor Name">
                          <Text strong>{proprietorName}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="Channel Category">
                          <Tag color="blue">B2B Retail Partner</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Mobile Phone">
                          <Space>
                            <Text code>+91 {phone}</Text>
                            {account?.phoneVerifiedAt ? (
                              <Tag color="success" icon={<CheckCircleFilled />}>
                                OTP Verified
                              </Tag>
                            ) : (
                              <Tag color="warning">Unverified</Tag>
                            )}
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Business Email">
                          {email ? <Text copyable>{email}</Text> : EM_DASH}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    {/* 2. GSTIN & Tax Compliance */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
                          <span>2. GSTIN &amp; Tax Compliance Audit</span>
                        </Space>
                      }
                      style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}
                      className="page-card"
                    >
                      <Descriptions column={2} bordered size="small">
                        <Descriptions.Item label="GSTIN Number (15-Digit)">
                          {gstin ? (
                            <Space>
                              <Text code style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                                {gstin}
                              </Text>
                              <Tag color="green">GST Validated</Tag>
                            </Space>
                          ) : (
                            <Text type="secondary">Not Provided</Text>
                          )}
                        </Descriptions.Item>

                        <Descriptions.Item label="Business PAN (10-Digit)">
                          {pan ? <Text code style={{ fontWeight: 600 }}>{pan}</Text> : EM_DASH}
                        </Descriptions.Item>

                        <Descriptions.Item label="Signup Referral Code" span={2}>
                          {account?.referralCode || customer?.referralCode ? (
                            <Space>
                              <Tag color="orange" style={{ fontWeight: 700 }}>
                                {account?.referralCode || customer?.referralCode}
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
                          ✔ <strong>Tax Invoice Status:</strong> Approved partner receives 100% GST-compliant invoices with HSN codes &amp; Input Tax Credit (ITC) eligibility.
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
                      className="page-card"
                    >
                      <Descriptions column={2} bordered size="small">
                        <Descriptions.Item label="Complete Street Address" span={2}>
                          <Text>{account?.addressLine || customer?.billingAddress || EM_DASH}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="City / Town">{account?.city || customer?.city || EM_DASH}</Descriptions.Item>
                        <Descriptions.Item label="District">{account?.district || customer?.district || EM_DASH}</Descriptions.Item>
                        <Descriptions.Item label="State">{account?.state || customer?.state || EM_DASH}</Descriptions.Item>
                        <Descriptions.Item label="Pincode">
                          {(account?.pincode || customer?.pincode) ? <Tag color="blue">{account?.pincode || customer?.pincode}</Tag> : EM_DASH}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    {/* 4. Timeline & Record Link */}
                    {account && (
                      <Card
                        size="small"
                        title={
                          <Space>
                            <IdcardOutlined style={{ color: '#722ed1' }} />
                            <span>4. Account Timeline &amp; Commercial Link</span>
                          </Space>
                        }
                        className="page-card"
                      >
                        <Descriptions column={2} bordered size="small">
                          <Descriptions.Item label="Registration Submitted">{formatDateTime(account.createdAt)}</Descriptions.Item>
                          <Descriptions.Item label="Phone Verified At">{formatDateTime(account.phoneVerifiedAt)}</Descriptions.Item>
                          <Descriptions.Item label="Last Login Activity">{formatDateTime(account.lastLoginAt)}</Descriptions.Item>
                          <Descriptions.Item label="Commercial Customer ID">
                            {customerCode ? (
                              <Tag color="cyan">{customerCode}</Tag>
                            ) : (
                              <Text type="secondary">Generated on Approval</Text>
                            )}
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>
                    )}
                  </Space>
                ),
              },
              {
                key: 'info',
                label: (
                  <Space size={6}>
                    <UserOutlined />
                    <span>COMMERCIAL PROFILE</span>
                  </Space>
                ),
                children: customer ? (
                  <div style={{ paddingTop: 12, maxWidth: 640 }}>
                    <Space direction="vertical" size={20} style={{ width: '100%' }}>
                      <InfoRow icon={<UserOutlined style={{ fontSize: 16 }} />} label="PROPRIETOR / CONTACT" value={customer.contactName || 'N/A'} />
                      <InfoRow icon={<MailOutlined style={{ fontSize: 16 }} />} label="EMAIL ADDRESS" value={customer.email || 'N/A'} />
                      <InfoRow
                        icon={<PhoneOutlined style={{ fontSize: 16 }} />}
                        label="PHONE NUMBER"
                        value={customer.phone || 'N/A'}
                        extra={
                          customer.phone && (
                            <Tooltip title="Direct WhatsApp Chat">
                              <WhatsAppOutlined
                                style={{ color: '#22c55e', fontSize: 14, cursor: 'pointer' }}
                                onClick={() => window.open(`https://wa.me/91${customer.phone.replace(/[^0-9]/g, '')}`, '_blank')}
                              />
                            </Tooltip>
                          )
                        }
                      />
                      <InfoRow
                        icon={<BankOutlined style={{ fontSize: 16 }} />}
                        label="GSTIN"
                        value={
                          customer.gstin ? (
                            <Text code style={{ fontSize: 12 }}>{customer.gstin}</Text>
                          ) : (
                            <Text type="secondary">Not provided</Text>
                          )
                        }
                      />
                      <InfoRow
                        icon={<EnvironmentOutlined style={{ fontSize: 16 }} />}
                        label="BILLING ADDRESS"
                        value={customer.billingAddress || 'No address saved'}
                      />
                      {customer.shippingAddress && customer.shippingAddress !== customer.billingAddress && (
                        <InfoRow icon={<EnvironmentOutlined style={{ fontSize: 16 }} />} label="SHIPPING ADDRESS" value={customer.shippingAddress} />
                      )}
                      <InfoRow
                        icon={<ShopOutlined style={{ fontSize: 16 }} />}
                        label="BRANCH &amp; SALES EXECUTIVE"
                        value={customer.branch?.name ?? EM_DASH}
                        extra={
                          customer.assignedTo?.fullName ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              ({customer.assignedTo.fullName})
                            </Text>
                          ) : null
                        }
                      />
                      <InfoRow
                        icon={<CopyOutlined style={{ fontSize: 16 }} />}
                        label="REFERRAL CODE"
                        value={
                          <Tag color="cyan" style={{ fontSize: 11, fontWeight: 500, margin: 0 }}>
                            {customer.referralCode}
                          </Tag>
                        }
                        extra={
                          <Tooltip title="Copy Code">
                            <CopyOutlined
                              style={{ fontSize: 12, cursor: 'pointer', color: '#64748b' }}
                              onClick={() => handleCopy(customer.referralCode, 'Referral Code')}
                            />
                          </Tooltip>
                        }
                      />
                    </Space>
                  </div>
                ) : (
                  <Empty description="Commercial profile active once application is approved" style={{ margin: '40px 0' }} />
                ),
              },
              {
                key: 'credit',
                label: (
                  <Space size={6}>
                    <CreditCardOutlined />
                    <span>CREDIT &amp; TAX</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 12 }}>
                    <Descriptions title="GST &amp; Billing Tax Info" bordered size="small" column={1}>
                      <Descriptions.Item label="GSTIN Number">
                        {gstin ? (
                          <Space>
                            <Text code>{gstin}</Text>
                            <Tag color="green">Verified Tax Entity</Tag>
                          </Space>
                        ) : (
                          EM_DASH
                        )}
                      </Descriptions.Item>
                      <Descriptions.Item label="Payment Terms">
                        <Tag color="blue">{customer?.paymentTerms || 'PREPAID'}</Tag>
                      </Descriptions.Item>
                    </Descriptions>

                    <Card size="small" title="Credit Headroom" style={{ borderRadius: 12 }} loading={creditQuery.isLoading}>
                      {creditData ? (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Row gutter={16}>
                            <Col span={8}>
                              <StatCard icon={<CreditCardOutlined />} tone="slate" label="CREDIT LIMIT" value={formatCurrency(creditData.creditLimit ?? 0)} />
                            </Col>
                            <Col span={8}>
                              <StatCard icon={<CreditCardOutlined />} tone="red" label="OUTSTANDING" value={formatCurrency(creditData.outstanding ?? 0)} />
                            </Col>
                            <Col span={8}>
                              <StatCard icon={<CreditCardOutlined />} tone="green" label="AVAILABLE CREDIT" value={formatCurrency(creditData.availableCredit ?? 0)} />
                            </Col>
                          </Row>

                          {utilization !== null && (
                            <div style={{ marginTop: 12 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Credit Utilization Rate
                              </Text>
                              <Progress percent={utilization} status={utilization > 90 ? 'exception' : 'active'} />
                            </div>
                          )}
                        </Space>
                      ) : (
                        <Text type="secondary">Prepaid account only. No active credit limit set.</Text>
                      )}
                    </Card>
                  </Space>
                ),
              },
              {
                key: 'orders',
                label: (
                  <Space size={6}>
                    <ShoppingOutlined />
                    <span>WHOLESALE ORDERS ({orders.length})</span>
                  </Space>
                ),
                children: (
                  <div style={{ paddingTop: 12 }}>
                    {ordersQuery.isLoading ? (
                      <Spin />
                    ) : orders.length > 0 ? (
                      <Table
                        dataSource={orders}
                        rowKey="id"
                        pagination={{ pageSize: 10 }}
                        size="small"
                        columns={[
                          {
                            title: 'Order No',
                            dataIndex: 'orderNumber',
                            key: 'orderNumber',
                            render: (num) => (
                              <Text
                                code
                                style={{ fontWeight: 500, cursor: 'pointer', color: '#1677ff' }}
                                onClick={() => navigate(`/b2b-orders?search=${encodeURIComponent(num)}`)}
                              >
                                {num}
                              </Text>
                            ),
                          },
                          { title: 'Date', dataIndex: 'orderDate', key: 'orderDate', render: (d) => dayjs(d).format('YYYY-MM-DD') },
                          { title: 'Total (₹)', dataIndex: 'total', key: 'total', render: (val) => formatCurrency(Number(val)) },
                          {
                            title: 'Payment',
                            dataIndex: 'paymentStatus',
                            key: 'paymentStatus',
                            render: (st) => <Tag color={st === 'PAID' ? 'green' : 'orange'} style={{ borderRadius: 4, fontWeight: 500 }}>{st}</Tag>,
                          },
                          {
                            title: 'Status',
                            dataIndex: 'status',
                            key: 'status',
                            render: (st) => <Tag color="blue" style={{ borderRadius: 4, fontWeight: 500 }}>{st}</Tag>,
                          },
                          {
                            title: 'Action',
                            key: 'action',
                            render: (_, row) => (
                              <Button
                                size="small"
                                type="link"
                                icon={<EyeOutlined />}
                                onClick={() => navigate(`/b2b-orders?search=${encodeURIComponent(row.orderNumber)}`)}
                              >
                                View Order
                              </Button>
                            ),
                          },
                        ]}
                      />
                    ) : (
                      <Empty description="No B2B wholesale orders placed yet" style={{ margin: '40px 0' }} />
                    )}
                  </div>
                ),
              },
              {
                key: 'wallet',
                label: (
                  <Space size={6}>
                    <WalletOutlined />
                    <span>WALLET &amp; COINS</span>
                  </Space>
                ),
                children: (
                  <div style={{ paddingTop: 12 }}>
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      <Col xs={24} sm={8}>
                        <StatCard icon={<WalletOutlined />} tone="green" label="AVAILABLE BALANCE" value={`🪙 ${walletData?.balance ?? customer?.coinBalance ?? 0}`} />
                      </Col>
                      <Col xs={24} sm={8}>
                        <StatCard icon={<WalletOutlined />} tone="blue" label="TOTAL EARNED" value={`🪙 ${walletData?.totalEarned ?? 0}`} />
                      </Col>
                      <Col xs={24} sm={8}>
                        <StatCard icon={<WalletOutlined />} tone="red" label="TOTAL USED" value={`🪙 ${walletData?.totalUsed ?? 0}`} />
                      </Col>
                    </Row>

                    <Table
                      loading={walletQuery.isLoading}
                      dataSource={walletData?.transactions ?? []}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      size="small"
                      locale={{ emptyText: <Empty description="No wallet transactions yet" /> }}
                      columns={[
                        { title: 'Date', dataIndex: 'createdAt', key: 'createdAt', render: (d) => dayjs(d).format('YYYY-MM-DD') },
                        { title: 'Reason', dataIndex: 'reason', key: 'reason', render: (r) => r.replace(/_/g, ' ') },
                        {
                          title: 'Amount',
                          dataIndex: 'amount',
                          key: 'amount',
                          render: (val: number) => (
                            <Text strong style={{ color: val >= 0 ? '#389e0d' : '#cf1322' }}>
                              {val >= 0 ? `+${val}` : val} 🪙
                            </Text>
                          ),
                        },
                        {
                          title: 'Order',
                          dataIndex: ['order', 'orderNumber'],
                          key: 'order',
                          render: (orderNumber) => (orderNumber ? <Text code>{orderNumber}</Text> : EM_DASH),
                        },
                        { title: 'Note', dataIndex: 'note', key: 'note', render: (n) => n || EM_DASH },
                      ]}
                    />
                  </div>
                ),
              },
              {
                key: 'support',
                label: (
                  <Space size={6}>
                    <HeartOutlined />
                    <span>SUPPORT &amp; REVIEWS</span>
                  </Space>
                ),
                children: (
                  <div style={{ paddingTop: 12 }}>
                    <Tabs
                      type="card"
                      items={[
                        {
                          key: 'tickets',
                          label: `Support Tickets (${supportTickets.length})`,
                          children: supportTickets.length > 0 ? (
                            <Table
                              loading={ticketsQuery.isLoading}
                              dataSource={supportTickets}
                              rowKey="id"
                              pagination={{ pageSize: 10 }}
                              size="small"
                              columns={[
                                {
                                  title: 'Ticket No',
                                  dataIndex: 'ticketNumber',
                                  key: 'ticketNumber',
                                  render: (num) => <Text code>{num}</Text>,
                                },
                                { title: 'Subject', dataIndex: 'subject', key: 'subject' },
                                { title: 'Category', dataIndex: 'category', key: 'category', render: (c) => c.replace(/_/g, ' ') },
                                {
                                  title: 'Priority',
                                  dataIndex: 'priority',
                                  key: 'priority',
                                  render: (p) => <Tag color={p === 'HIGH' ? 'red' : p === 'MEDIUM' ? 'orange' : 'blue'}>{p}</Tag>,
                                },
                                {
                                  title: 'Status',
                                  dataIndex: 'status',
                                  key: 'status',
                                  render: (s) => (
                                    <Tag color={s === 'OPEN' ? 'gold' : s === 'IN_PROGRESS' ? 'blue' : s === 'RESOLVED' ? 'green' : 'default'}>
                                      {s.replace('_', ' ')}
                                    </Tag>
                                  ),
                                },
                                { title: 'Raised On', dataIndex: 'createdAt', key: 'createdAt', render: (d) => dayjs(d).format('YYYY-MM-DD') },
                              ]}
                            />
                          ) : (
                            <Empty description="No support tickets raised" style={{ margin: '30px 0' }} />
                          ),
                        },
                        {
                          key: 'wishlist',
                          label: `Saved Products (${wishlistItems.length})`,
                          children: wishlistItems.length > 0 ? (
                            <Table
                              dataSource={wishlistItems}
                              rowKey="productId"
                              pagination={{ pageSize: 10 }}
                              size="small"
                              columns={[
                                {
                                  title: 'Product',
                                  key: 'product',
                                  render: (_, row) => (
                                    <Space>
                                      {row.product.images?.[0] && <Avatar shape="square" src={row.product.images[0]} />}
                                      <Text strong>{row.product.name}</Text>
                                    </Space>
                                  ),
                                },
                                { title: 'SKU', dataIndex: ['product', 'sku'], key: 'sku', render: (sku) => <Text code>{sku}</Text> },
                                { title: 'Unit', dataIndex: ['product', 'unit'], key: 'unit' },
                                {
                                  title: 'Saved On',
                                  dataIndex: 'createdAt',
                                  key: 'createdAt',
                                  render: (d) => dayjs(d).format('YYYY-MM-DD'),
                                },
                              ]}
                            />
                          ) : (
                            <Empty description="No saved products" style={{ margin: '30px 0' }} />
                          ),
                        },
                        {
                          key: 'reviews',
                          label: `Product Reviews (${reviews.length})`,
                          children: reviews.length > 0 ? (
                            <Table
                              dataSource={reviews}
                              rowKey="id"
                              pagination={{ pageSize: 10 }}
                              size="small"
                              columns={[
                                { title: 'Product', dataIndex: ['product', 'name'], key: 'product' },
                                {
                                  title: 'Rating',
                                  dataIndex: 'rating',
                                  key: 'rating',
                                  render: (r) => <Rate disabled value={r} style={{ fontSize: 14 }} />,
                                },
                                { title: 'Comment', dataIndex: 'comment', key: 'comment', render: (c) => c || EM_DASH },
                                {
                                  title: 'Order',
                                  dataIndex: ['order', 'orderNumber'],
                                  key: 'order',
                                  render: (num) => (num ? <Text code>{num}</Text> : EM_DASH),
                                },
                                {
                                  title: 'Date',
                                  dataIndex: 'createdAt',
                                  key: 'createdAt',
                                  render: (d) => dayjs(d).format('YYYY-MM-DD'),
                                },
                              ]}
                            />
                          ) : (
                            <Empty description="No product reviews submitted" style={{ margin: '30px 0' }} />
                          ),
                        },
                      ]}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </Space>

      {formOpen && customer && <CustomerFormModal open={formOpen} customer={customer} onClose={() => setFormOpen(false)} />}
      <CustomerCreditDrawer customer={creditOpen && customer ? customer : null} onClose={() => setCreditOpen(false)} />
    </div>
  );
}
