import {
  ArrowLeftOutlined,
  CopyOutlined,
  CreditCardOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  GiftOutlined,
  MailOutlined,
  PhoneOutlined,
  ShoppingOutlined,
  StarOutlined,
  WalletOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
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
  Statistic,
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
import { COIN_TRANSACTION_REASON_LABELS } from '@shared/api/types';
import {
  useCustomer,
  useCustomerCredit,
  useCustomerReviews,
  useCustomerSupportTickets,
  useCustomerWallet,
  useCustomerWishlist,
  useSetCustomerStatus,
} from '@shared/hooks/useCustomers';
import { EM_DASH, formatCurrency } from '../../utils/format';
import { CustomerCreditDrawer } from './CustomerCreditDrawer';
import { CustomerFormModal } from './CustomerFormModal';
import { ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from '../sales/orderStatus';
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

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();

  const [formOpen, setFormOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  const customerQuery = useCustomer(id);
  const setStatusMutation = useSetCustomerStatus();
  const customer = customerQuery.data ?? null;

  const isB2B = customer?.channel === 'B2B';
  const creditQuery = useCustomerCredit(customer?.id, isB2B);
  const creditData = creditQuery.data;

  const walletQuery = useCustomerWallet(customer?.id);
  const walletData = walletQuery.data;

  const wishlistQuery = useCustomerWishlist(customer?.id);
  const wishlistItems = wishlistQuery.data ?? [];

  const reviewsQuery = useCustomerReviews(customer?.id);
  const reviews = reviewsQuery.data ?? [];

  const ticketsQuery = useCustomerSupportTickets(customer?.id);
  const supportTickets = ticketsQuery.data ?? [];

  const orders = customer?.orders ?? [];
  const orderBase = isB2B ? '/b2b-orders' : '/b2c-orders';

  // Newest first; the balance after each row is today's balance minus every
  // movement that came later.
  const walletLedger = useMemo(() => {
    const rows = walletData?.transactions ?? [];
    let running = walletData?.balance ?? customer?.coinBalance ?? 0;
    return rows.map((t) => {
      const balanceAfter = running;
      running -= t.amount;
      return { ...t, balanceAfter };
    });
  }, [walletData, customer]);

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

  if (!customer) {
    return (
      <Card style={{ marginTop: 24, borderRadius: 16 }}>
        <Result
          status="404"
          title="Customer Not Found"
          subTitle={`No customer record matches the requested ID (${id || ''}).`}
          extra={
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/b2c-customers')} style={{ borderRadius: 8 }}>
              Back to Customers List
            </Button>
          }
        />
      </Card>
    );
  }

  const initials = customer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const memberSince = customer.createdAt
    ? dayjs(customer.createdAt).format('MMM YYYY').toUpperCase()
    : EM_DASH;

  return (
    <div style={{ padding: '16px 8px 32px 8px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        {/* Top Header Card — Sleek Floating Bar */}
        <div className="page-card" style={{ padding: '16px 24px' }}>
          <Row gutter={[16, 16]} align="middle" justify="space-between">
            <Col>
              <Space size={16} align="center">
                {/* Back Circle Arrow Button */}
                <Button
                  shape="circle"
                  icon={<ArrowLeftOutlined style={{ fontSize: 16, color: '#475569' }} />}
                  onClick={() => navigate('/b2c-customers')}
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

                {/* Dark Rounded Initials Square Avatar */}
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: customer.channel === 'B2C' ? '#0f172a' : '#1e293b',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 18,
                    letterSpacing: 1,
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)',
                  }}
                >
                  {initials}
                </div>

                {/* Title and ID info */}
                <Space direction="vertical" size={2}>
                  <Space align="center" size={10} style={{ flexWrap: 'wrap' }}>
                    <Text className="page-title">{customer.name}</Text>
                    <Tag className={`page-pill page-pill--${customer.status === 'ACTIVE' ? 'green' : customer.status === 'BLACKLISTED' ? 'red' : 'slate'}`}>
                      {customer.status === 'ACTIVE' ? 'ACTIVE CUSTOMER' : customer.status}
                    </Tag>
                  </Space>

                  <Text type="secondary" className="page-meta">
                    CUSTOMER ID: #{customer.customerCode} • MEMBER SINCE {memberSince}
                  </Text>
                </Space>
              </Space>
            </Col>

            {/* Top Right Action Buttons */}
            <Col>
              <Space size={10} style={{ flexWrap: 'wrap' }}>
                {isB2B && (
                  <Button
                    icon={<CreditCardOutlined />}
                    onClick={() => setCreditOpen(true)}
                    style={{ borderRadius: 8 }}
                  >
                    Manage Credit
                  </Button>
                )}
                <Can do="CUSTOMER_EDIT">
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => setFormOpen(true)}
                    style={{ borderRadius: 8 }}
                  >
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

        {/* Main 2-Column Dashboard Body */}
        <Row gutter={[20, 20]}>
          {/* Left Column — Contact Info & Admin Notes */}
          <Col xs={24} lg={7}>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              {/* Contact Information Card */}
              <Card bodyStyle={{ padding: '24px 20px' }} className="page-card">
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                  <Text className="page-section-label">CONTACT INFORMATION</Text>

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
                    icon={<EnvironmentOutlined style={{ fontSize: 16 }} />}
                    label="PRIMARY ADDRESS"
                    value={customer.billingAddress || customer.shippingAddress || 'No address saved'}
                  />

                  <InfoRow
                    icon={<GiftOutlined style={{ fontSize: 16 }} />}
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
              </Card>

              {/* Account summary - real figures only */}
              <div className="page-dark-card" style={{ position: 'relative', overflow: 'hidden' }}>
                <Space direction="vertical" size={10} style={{ width: '100%', position: 'relative', zIndex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                    ACCOUNT SUMMARY
                  </Text>
                  <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, display: 'block' }}>
                    Last order: {customer.stats?.lastOrderDate ? dayjs(customer.stats.lastOrderDate).format('DD MMM YYYY') : 'none yet'}
                    <br />
                    Refund wallet: {formatCurrency(customer.refundWalletBalance ?? 0)}
                    <br />
                    Assigned to: {customer.assignedTo?.fullName ?? 'nobody'}
                    {customer.referredAs ? (
                      <>
                        <br />
                        Referred by: {customer.referredAs.referrer.name} ({customer.referredAs.referrer.customerCode})
                      </>
                    ) : null}
                  </Text>
                </Space>
              </div>
            </Space>
          </Col>

          {/* Right Column — Top Stats Row & Tabbed Activity Content */}
          <Col xs={24} lg={17}>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              {/* Top Stats Cards Row */}
              <Row gutter={[16, 16]}>
                <Col xs={12} sm={6}>
                  <StatCard icon={<ShoppingOutlined style={{ fontSize: 18 }} />} tone="slate" label="TOTAL ORDERS" value={customer.stats?.orderCount ?? orders.length} />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard
                    icon={<WalletOutlined style={{ fontSize: 18 }} />}
                    tone="green"
                    label="LTV (REVENUE)"
                    value={formatCurrency(customer.stats?.lifetimeValue ?? 0)}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard
                    icon={<GiftOutlined style={{ fontSize: 18 }} />}
                    tone="amber"
                    label="WALLET BALANCE"
                    value={`🪙 ${walletData?.balance ?? customer.coinBalance ?? 0}`}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard icon={<StarOutlined style={{ fontSize: 18 }} />} tone="pink" label="AVG RATING" value={customer.stats?.averageRating != null ? `${customer.stats.averageRating} ★` : EM_DASH} />
                </Col>
              </Row>

              {/* Tabbed Activity Container */}
              <Card bodyStyle={{ padding: '20px 24px' }} className="page-card">
                <Tabs
                  defaultActiveKey="orders"
                  style={{ fontWeight: 500 }}
                  items={[
                    {
                      key: 'orders',
                      label: `ORDERS (${customer.stats?.orderCount ?? orders.length})`,
                      children: (
                        <div style={{ paddingTop: 12 }}>
                          {orders.length > 0 ? (
                            <Table
                              dataSource={orders}
                              rowKey="id"
                              pagination={false}
                              size="small"
                              columns={[
                                {
                                  title: 'Order No',
                                  dataIndex: 'orderNumber',
                                  key: 'orderNumber',
                                  render: (num, row) => (
                                    <Text
                                      code
                                      style={{ fontWeight: 500, cursor: 'pointer', color: '#1677ff', whiteSpace: 'nowrap' }}
                                      onClick={() => navigate(`${orderBase}/${row.id}`)}
                                    >
                                      {num}
                                    </Text>
                                  ),
                                },
                                {
                                  title: 'Date',
                                  dataIndex: 'orderDate',
                                  key: 'orderDate',
                                  render: (d: string) => dayjs(d).format('DD MMM YYYY'),
                                },
                                { title: 'Items', key: 'items', render: (_, row) => row._count?.items ?? EM_DASH },
                                {
                                  title: 'Total (₹)',
                                  dataIndex: 'total',
                                  key: 'total',
                                  render: (val) => formatCurrency(val),
                                },
                                {
                                  title: 'Payment',
                                  dataIndex: 'paymentStatus',
                                  key: 'paymentStatus',
                                  render: (st) => (
                                    <Tag color={st === 'PAID' ? 'green' : st === 'PARTIAL' ? 'gold' : 'default'} style={{ borderRadius: 4, fontWeight: 500 }}>
                                      {st}
                                    </Tag>
                                  ),
                                },
                                {
                                  title: 'Fulfillment',
                                  dataIndex: 'status',
                                  key: 'status',
                                  render: (st: keyof typeof ORDER_STATUS_LABEL) => (
                                    <Tag color={ORDER_STATUS_COLOUR[st]} style={{ borderRadius: 4, fontWeight: 500 }}>
                                      {ORDER_STATUS_LABEL[st]}
                                    </Tag>
                                  ),
                                },
                                {
                                  title: 'Action',
                                  key: 'action',
                                  render: (_, row) => (
                                    <Button
                                      size="small"
                                      type="link"
                                      icon={<EyeOutlined />}
                                      onClick={() => navigate(`${orderBase}/${row.id}`)}
                                    >
                                      View Order
                                    </Button>
                                  ),
                                },
                              ]}
                            />
                          ) : (
                            <Empty description="No orders placed yet" style={{ margin: '40px 0' }} />
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'wallet',
                      label: 'WALLET & COINS',
                      children: (
                        <div style={{ paddingTop: 12 }}>
                          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                            <Col xs={24} sm={8}>
                              <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f', borderRadius: 12 }}>
                                <Statistic
                                  title="Available Balance"
                                  value={walletData?.balance ?? customer.coinBalance ?? 0}
                                  prefix="🪙"
                                  valueStyle={{ color: '#389e0d', fontSize: 18, fontWeight: 600 }}
                                />
                              </Card>
                            </Col>
                            <Col xs={24} sm={8}>
                              <Card size="small" style={{ background: '#f0f5ff', borderColor: '#adc6ff', borderRadius: 12 }}>
                                <Statistic
                                  title="Total Coins Earned"
                                  value={walletData?.totalEarned ?? 0}
                                  prefix="🪙"
                                  valueStyle={{ color: '#1d39c4', fontSize: 18, fontWeight: 600 }}
                                />
                              </Card>
                            </Col>
                            <Col xs={24} sm={8}>
                              <Card size="small" style={{ background: '#fff1f0', borderColor: '#ffa39e', borderRadius: 12 }}>
                                <Statistic
                                  title="Total Coins Used / Redeemed"
                                  value={walletData?.totalUsed ?? 0}
                                  prefix="🪙"
                                  valueStyle={{ color: '#cf1322', fontSize: 18, fontWeight: 600 }}
                                />
                              </Card>
                            </Col>
                          </Row>

                          <Table
                            dataSource={walletLedger}
                            rowKey="id"
                            loading={walletQuery.isLoading}
                            pagination={walletLedger.length > 20 ? { pageSize: 20 } : false}
                            size="small"
                            locale={{ emptyText: 'No coin movements yet' }}
                            columns={[
                              {
                                title: 'Date & Time',
                                dataIndex: 'createdAt',
                                key: 'createdAt',
                                render: (d: string) => dayjs(d).format('DD MMM YYYY, HH:mm'),
                              },
                              {
                                title: 'Description / Event',
                                key: 'description',
                                render: (_, row) => (
                                  <Space direction="vertical" size={0}>
                                    <Text style={{ fontWeight: 500 }}>
                                      {COIN_TRANSACTION_REASON_LABELS[row.reason as keyof typeof COIN_TRANSACTION_REASON_LABELS] ?? row.reason}
                                      {row.order ? ` · ${row.order.orderNumber}` : ''}
                                    </Text>
                                    {row.note ? <Text type="secondary" style={{ fontSize: 12 }}>{row.note}</Text> : null}
                                  </Space>
                                ),
                              },
                              {
                                title: 'Type',
                                key: 'type',
                                render: (_, row) => (
                                  <Tag color={row.amount >= 0 ? 'green' : 'volcano'} style={{ borderRadius: 4, fontWeight: 500 }}>
                                    {row.amount >= 0 ? 'CREDIT' : 'DEBIT'}
                                  </Tag>
                                ),
                              },
                              {
                                title: 'Coins Amount',
                                key: 'coins',
                                render: (_, row) => (
                                  <Text style={{ fontWeight: 600, color: row.amount >= 0 ? '#389e0d' : '#cf1322' }}>
                                    {row.amount >= 0 ? `+${row.amount}` : row.amount} 🪙
                                  </Text>
                                ),
                              },
                              {
                                title: 'Balance After',
                                dataIndex: 'balanceAfter',
                                key: 'balanceAfter',
                                render: (val) => <Text code style={{ fontWeight: 500 }}>🪙 {val}</Text>,
                              },
                            ]}
                          />
                        </div>
                      ),
                    },
                    {
                      key: 'wishlist',
                      label: `WISHLIST (${wishlistItems.length})`,
                      children: (
                        <div style={{ paddingTop: 12 }}>
                          {wishlistItems.length > 0 ? (
                            <Table
                              dataSource={wishlistItems}
                              rowKey="id"
                              pagination={false}
                              size="small"
                              columns={[
                                {
                                  title: 'Product',
                                  key: 'product',
                                  render: (_, item) => {
                                    const productName = item.product?.name ?? item.productId;
                                    return (
                                      <Text
                                        style={{ fontWeight: 500, cursor: 'pointer', color: '#1677ff' }}
                                        onClick={() => navigate(`/products?search=${encodeURIComponent(productName)}`)}
                                      >
                                        {productName}
                                      </Text>
                                    );
                                  },
                                },
                                {
                                  title: 'Price',
                                  key: 'price',
                                  render: (_, item) =>
                                    (item.product as any)?.sellingPrice
                                      ? formatCurrency((item.product as any).sellingPrice)
                                      : EM_DASH,
                                },
                                {
                                  title: 'Added Date',
                                  dataIndex: 'createdAt',
                                  key: 'createdAt',
                                  render: (d) => (d ? dayjs(d).format('YYYY-MM-DD') : EM_DASH),
                                },
                                {
                                  title: 'Action',
                                  key: 'action',
                                  render: (_, item) => {
                                    const productName = item.product?.name ?? item.productId;
                                    return (
                                      <Button
                                        size="small"
                                        type="link"
                                        icon={<EyeOutlined />}
                                        onClick={() => navigate(`/products?search=${encodeURIComponent(productName)}`)}
                                      >
                                        View Product
                                      </Button>
                                    );
                                  },
                                },
                              ]}
                            />
                          ) : (
                            <Empty description="No saved wishlist items" style={{ margin: '40px 0' }} />
                          )}
                        </div>
                      ),
                    },
                    {
                      key: 'reviews',
                      label: `REVIEWS (${reviews.length})`,
                      children: (
                        <div style={{ paddingTop: 12 }}>
                          {reviews.length > 0 ? (
                            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                              {reviews.map((rev) => (
                                <Card key={rev.id} size="small" style={{ borderRadius: 12, background: '#f8fafc' }}>
                                  <Row justify="space-between" align="middle">
                                    <Col>
                                      <Space size={8}>
                                        <Text
                                          style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#1677ff' }}
                                          onClick={() => navigate(`/products?search=${encodeURIComponent(rev.product.name)}`)}
                                        >
                                          {rev.product.name}
                                        </Text>
                                        <Button
                                          size="small"
                                          type="link"
                                          icon={<EyeOutlined />}
                                          onClick={() => navigate(`/products?search=${encodeURIComponent(rev.product.name)}`)}
                                        >
                                          View Product
                                        </Button>
                                      </Space>
                                      <div>
                                        <Rate disabled defaultValue={rev.rating} style={{ fontSize: 13 }} />
                                      </div>
                                    </Col>
                                    <Col>
                                      <Text type="secondary" style={{ fontSize: 12 }}>
                                        {dayjs(rev.createdAt).format('DD MMM YYYY')}
                                        {rev.order ? ` · ${rev.order.orderNumber}` : ''}
                                      </Text>
                                    </Col>
                                  </Row>
                                  {rev.comment ? (
                                    <Text style={{ marginTop: 8, display: 'block', color: '#475569' }}>
                                      &ldquo;{rev.comment}&rdquo;
                                    </Text>
                                  ) : null}
                                </Card>
                              ))}
                            </Space>
                          ) : (
                            <Empty description="No product reviews submitted" style={{ margin: '40px 0' }} />
                          )}
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
                              dataSource={supportTickets}
                              rowKey="id"
                              pagination={false}
                              size="small"
                              columns={[
                                {
                                  title: 'Ticket ID',
                                  dataIndex: 'ticketNumber',
                                  key: 'ticketNumber',
                                  render: (ticketNum, row) => (
                                    <Text
                                      code
                                      style={{ fontWeight: 500, cursor: 'pointer', color: '#1677ff' }}
                                      onClick={() => navigate(`/complaints?search=${encodeURIComponent(ticketNum ?? row.id)}`)}
                                    >
                                      {ticketNum ?? row.id}
                                    </Text>
                                  ),
                                },
                                { title: 'Subject', dataIndex: 'subject', key: 'subject' },
                                { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color="orange" style={{ fontWeight: 500 }}>{s}</Tag> },
                                { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: (d) => dayjs(d).format('YYYY-MM-DD') },
                                {
                                  title: 'Action',
                                  key: 'action',
                                  render: (_, row) => (
                                    <Button
                                      size="small"
                                      type="link"
                                      icon={<EyeOutlined />}
                                      onClick={() => navigate(`/complaints?search=${encodeURIComponent(row.ticketNumber ?? row.id)}`)}
                                    >
                                      View Ticket
                                    </Button>
                                  ),
                                },
                              ]}
                            />
                          ) : (
                            <Empty description="No support tickets raised" style={{ margin: '40px 0' }} />
                          )}
                        </div>
                      ),
                    },
                    ...(isB2B
                      ? [
                          {
                            key: 'credit',
                            label: 'B2B CREDIT & TAX',
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

                                <Card size="small" title="B2B Credit Headroom" style={{ borderRadius: 12 }}>
                                  {creditData ? (
                                    <Space direction="vertical" style={{ width: '100%' }}>
                                      <Row gutter={16}>
                                        <Col span={8}>
                                          <Statistic title="Credit Limit" value={creditData.creditLimit ?? 0} prefix="₹" />
                                        </Col>
                                        <Col span={8}>
                                          <Statistic title="Outstanding" value={creditData.outstanding ?? 0} prefix="₹" valueStyle={{ color: '#cf1322' }} />
                                        </Col>
                                        <Col span={8}>
                                          <Statistic title="Available Credit" value={creditData.availableCredit ?? 0} prefix="₹" valueStyle={{ color: '#389e0d' }} />
                                        </Col>
                                      </Row>

                                      {creditData.creditLimit ? (
                                        <div style={{ marginTop: 12 }}>
                                          <Text type="secondary" style={{ fontSize: 12 }}>
                                            Credit Utilization Rate
                                          </Text>
                                          <Progress
                                            percent={Math.min(100, Math.round(((creditData.outstanding ?? 0) / creditData.creditLimit) * 100))}
                                            status={((creditData.outstanding ?? 0) / creditData.creditLimit) > 0.9 ? 'exception' : 'active'}
                                          />
                                        </div>
                                      ) : null}
                                    </Space>
                                  ) : (
                                    <Text type="secondary">Prepaid account only. No active credit limit set.</Text>
                                  )}
                                </Card>
                              </Space>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </Card>
            </Space>
          </Col>
        </Row>
      </Space>

      {/* Form Modal for Editing */}
      {formOpen && (
        <CustomerFormModal
          open={formOpen}
          customer={customer}
          onClose={() => setFormOpen(false)}
        />
      )}

      {/* Credit Drawer for B2B */}
      <CustomerCreditDrawer
        customer={creditOpen ? customer : null}
        onClose={() => setCreditOpen(false)}
      />
    </div>
  );
}
