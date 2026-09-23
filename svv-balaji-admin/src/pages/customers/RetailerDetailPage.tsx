import {
  ArrowLeftOutlined,
  BankOutlined,
  CopyOutlined,
  CreditCardOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  HeartOutlined,
  MailOutlined,
  PhoneOutlined,
  ShopOutlined,
  ShoppingOutlined,
  StarOutlined,
  UserOutlined,
  WalletOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
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
  useCustomer,
  useCustomerCredit,
  useCustomerReviews,
  useCustomerSupportTickets,
  useCustomerWallet,
  useCustomerWishlist,
  useSetCustomerStatus,
} from '@shared/hooks/useCustomers';
import { useOrders } from '@shared/hooks/useSales';
import { EM_DASH, formatCurrency } from '../../utils/format';
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
 * Retailer / B2B partner profile - the counterpart to CustomerDetailPage for
 * the B2B channel (DISTRIBUTOR, RETAILER, INSTITUTIONAL). Same tab set as a
 * B2C customer (personal info, orders, wallet, wishlist, reviews, support)
 * plus a B2B-only Credit & Tax tab. Every tab is a live query against its own
 * endpoint - no MOCK_CUSTOMERS fallback and no placeholder rows.
 */
export function RetailerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();

  const [formOpen, setFormOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  const customerQuery = useCustomer(id);
  const customer = customerQuery.data ?? null;
  const setStatusMutation = useSetCustomerStatus();

  const creditQuery = useCustomerCredit(customer?.id, true);
  const creditData = creditQuery.data;

  const walletQuery = useCustomerWallet(customer?.id);
  const walletData = walletQuery.data;

  const ticketsQuery = useCustomerSupportTickets(customer?.id);
  const supportTickets = ticketsQuery.data ?? [];

  const wishlistQuery = useCustomerWishlist(customer?.id);
  const wishlistItems = wishlistQuery.data ?? [];

  const reviewsQuery = useCustomerReviews(customer?.id);
  const reviews = reviewsQuery.data ?? [];

  const ordersQuery = useOrders(customer?.id ? { customerId: customer.id } : { customerId: '__none__' });
  const orders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);

  const totalBusinessValue = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.total), 0),
    [orders],
  );

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

  if (customerQuery.isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!customer || customer.channel !== 'B2B') {
    return (
      <Card style={{ marginTop: 24, borderRadius: 16 }}>
        <Result
          status="404"
          title="Retailer Not Found"
          subTitle={`No B2B partner record matches the requested ID (${id || ''}).`}
          extra={
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/b2b-accounts')} style={{ borderRadius: 8 }}>
              Back to Retailer Accounts
            </Button>
          }
        />
      </Card>
    );
  }

  const memberSince = customer.createdAt ? dayjs(customer.createdAt).format('MMM YYYY').toUpperCase() : EM_DASH;
  const limit = creditData?.creditLimit ?? (customer.creditLimit ? Number(customer.creditLimit) : null);
  const outstanding = creditData?.outstanding ?? 0;
  const utilization = limit ? Math.min(100, Math.round((outstanding / limit) * 100)) : null;

  return (
    <div style={{ padding: '16px 8px 32px 8px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        {/* Top Header Card */}
        <div className="page-card" style={{ padding: '16px 24px' }}>
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
                    background: '#1e293b',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)',
                  }}
                >
                  <ShopOutlined />
                </div>

                <Space direction="vertical" size={2}>
                  <Space align="center" size={10} style={{ flexWrap: 'wrap' }}>
                    <Text className="page-title">{customer.name}</Text>
                    <Tag className={`page-pill page-pill--${customer.status === 'ACTIVE' ? 'green' : customer.status === 'BLACKLISTED' ? 'red' : 'slate'}`}>
                      {customer.status === 'ACTIVE' ? 'ACTIVE PARTNER' : customer.status}
                    </Tag>
                    <Tag color="blue" style={{ borderRadius: 20, fontWeight: 500, fontSize: 11, margin: 0 }}>
                      {customer.type}
                    </Tag>
                  </Space>
                  <Text type="secondary" className="page-meta">
                    PARTNER ID: #{customer.customerCode} • PARTNER SINCE {memberSince}
                  </Text>
                </Space>
              </Space>
            </Col>

            <Col>
              <Space size={10} style={{ flexWrap: 'wrap' }}>
                <Button icon={<CreditCardOutlined />} onClick={() => setCreditOpen(true)} style={{ borderRadius: 8 }}>
                  Manage Credit
                </Button>
                <Can do="CUSTOMER_EDIT">
                  <Button icon={<EditOutlined />} onClick={() => setFormOpen(true)} style={{ borderRadius: 8 }}>
                    Edit Profile
                  </Button>
                </Can>
                <Can do="CUSTOMER_STATUS">
                  {STATUS_ACTIONS[customer.status].map((action) => (
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
              </Space>
            </Col>
          </Row>
        </div>

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

        <Card bodyStyle={{ padding: '20px 24px' }} className="page-card">
          <Tabs
            defaultActiveKey="info"
            items={[
              {
                key: 'info',
                label: 'PERSONAL INFORMATION',
                children: (
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
                        label="BRANCH & SALES EXECUTIVE"
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
                ),
              },
              {
                key: 'orders',
                      label: `ORDERS (${orders.length})`,
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
                            <Empty description="No B2B orders placed yet" style={{ margin: '40px 0' }} />
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'credit',
                      label: 'CREDIT & TAX',
                      children: (
                        <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 12 }}>
                          <Descriptions title="GST & Billing Tax Info" bordered size="small" column={1}>
                            <Descriptions.Item label="GSTIN Number">
                              {customer.gstin ? (
                                <Space>
                                  <Text code>{customer.gstin}</Text>
                                  <Tag color="green">Verified Tax Entity</Tag>
                                </Space>
                              ) : (
                                EM_DASH
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="Payment Terms">
                              <Tag color="blue">{customer.paymentTerms}</Tag>
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
                      key: 'wallet',
                      label: 'WALLET & COINS',
                      children: (
                        <div style={{ paddingTop: 12 }}>
                          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                            <Col xs={24} sm={8}>
                              <StatCard icon={<WalletOutlined />} tone="green" label="AVAILABLE BALANCE" value={`🪙 ${walletData?.balance ?? customer.coinBalance ?? 0}`} />
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
                      label: `SUPPORT (${supportTickets.length})`,
                      children: (
                        <div style={{ paddingTop: 12 }}>
                          {supportTickets.length > 0 ? (
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
                              expandable={{
                                expandedRowRender: (row) => (
                                  <div style={{ padding: '4px 8px' }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      {row.description}
                                    </Text>
                                    {row.resolutionNote && (
                                      <div style={{ marginTop: 4 }}>
                                        <Text strong style={{ fontSize: 12 }}>
                                          Resolution:{' '}
                                        </Text>
                                        <Text style={{ fontSize: 12 }}>{row.resolutionNote}</Text>
                                      </div>
                                    )}
                                  </div>
                                ),
                              }}
                            />
                          ) : (
                            <Empty description="No support tickets raised" style={{ margin: '40px 0' }} />
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'wishlist',
                      label: `WISHLIST (${wishlistItems.length})`,
                      children: (
                        <div style={{ paddingTop: 12 }}>
                          {wishlistQuery.isLoading ? (
                            <Spin />
                          ) : wishlistItems.length > 0 ? (
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
                            <Empty description="No saved products" style={{ margin: '40px 0' }} />
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'reviews',
                      label: `REVIEWS (${reviews.length})`,
                      children: (
                        <div style={{ paddingTop: 12 }}>
                          {reviewsQuery.isLoading ? (
                            <Spin />
                          ) : reviews.length > 0 ? (
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
                            <Empty description="No product reviews submitted" style={{ margin: '40px 0' }} />
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              </Card>
      </Space>

      {formOpen && <CustomerFormModal open={formOpen} customer={customer} onClose={() => setFormOpen(false)} />}
      <CustomerCreditDrawer customer={creditOpen ? customer : null} onClose={() => setCreditOpen(false)} />
    </div>
  );
}
