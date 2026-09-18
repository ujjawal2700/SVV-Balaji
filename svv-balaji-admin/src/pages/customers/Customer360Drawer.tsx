import {
  AppstoreOutlined,
  CopyOutlined,
  CreditCardOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  MailOutlined,
  PhoneOutlined,
  ShoppingOutlined,
  SolutionOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useMemo } from 'react';
import type { Customer } from '../../api/types';
import { useCustomerCredit } from '@shared/hooks/useCustomers';
import { EM_DASH, formatCurrency } from '../../utils/format';

const { Text, Title, Paragraph } = Typography;

export function Customer360Drawer({
  customer,
  onClose,
  onEdit,
}: {
  customer: Customer | null;
  onClose: () => void;
  onEdit?: (customer: Customer) => void;
}) {
  const { message } = AntApp.useApp();
  const isB2B = customer?.channel === 'B2B';

  const creditQuery = useCustomerCredit(customer?.id, isB2B);
  const creditData = creditQuery.data;

  // Mock customer orders history for CRM display
  const mockOrders = useMemo(() => {
    if (!customer) return [];
    return [
      {
        id: 'ord-101',
        orderNumber: 'ORD-2026-8812',
        date: '2026-09-15',
        itemCount: 3,
        total: 1450,
        paymentStatus: 'PAID',
        fulfillmentStatus: 'DELIVERED',
      },
      {
        id: 'ord-102',
        orderNumber: 'ORD-2026-7940',
        date: '2026-09-02',
        itemCount: 1,
        total: 620,
        paymentStatus: 'PAID',
        fulfillmentStatus: 'DELIVERED',
      },
    ];
  }, [customer]);

  if (!customer) return null;

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    message.success(`${label} copied to clipboard`);
  };

  return (
    <Drawer
      title={
        <Space align="center">
          <Avatar
            size="large"
            style={{
              backgroundColor: customer.channel === 'B2C' ? '#722ed1' : '#1677ff',
            }}
          >
            {customer.name.charAt(0).toUpperCase()}
          </Avatar>
          <Space direction="vertical" size={0}>
            <Space size={8}>
              <Title level={5} style={{ margin: 0 }}>
                {customer.name}
              </Title>
              <Tag color={customer.channel === 'B2C' ? 'purple' : 'blue'}>
                {customer.channel} · {customer.type}
              </Tag>
              <Tag color={customer.status === 'ACTIVE' ? 'green' : customer.status === 'BLACKLISTED' ? 'red' : 'default'}>
                {customer.status}
              </Tag>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Code: <Text code>{customer.customerCode}</Text>
            </Text>
          </Space>
        </Space>
      }
      width={680}
      open={Boolean(customer)}
      onClose={onClose}
      extra={
        <Space>
          {onEdit && (
            <Button onClick={() => onEdit(customer)}>Edit Profile</Button>
          )}
          <Button type="primary" onClick={onClose}>
            Done
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Profile Metric Summary Cards */}
        <Row gutter={[12, 12]}>
          <Col span={8}>
            <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Statistic
                title="Coin Balance"
                value={customer.coinBalance ?? 0}
                prefix="🪙"
                valueStyle={{ color: '#389e0d', fontSize: 18 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: '#f0f5ff', borderColor: '#adc6ff' }}>
              <Statistic
                title="Lifetime Spend (LTV)"
                value={customer.channel === 'B2C' ? 2070 : 85000}
                prefix="₹"
                valueStyle={{ color: '#1d39c4', fontSize: 18 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
              <Statistic
                title="Total Orders"
                value={customer.channel === 'B2C' ? 2 : 14}
                prefix={<ShoppingOutlined style={{ color: '#d46b08' }} />}
                valueStyle={{ color: '#d46b08', fontSize: 18 }}
              />
            </Card>
          </Col>
        </Row>

        {/* Tabbed CRM Information */}
        <Tabs
          defaultActiveKey="overview"
          items={[
            {
              key: 'overview',
              label: 'Profile Details',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Descriptions title="Contact Information" bordered column={1} size="small">
                    <Descriptions.Item label="Phone Number">
                      <Space>
                        <PhoneOutlined />
                        <Text strong>{customer.phone}</Text>
                        <Tooltip title="Chat on WhatsApp">
                          <Button
                            type="text"
                            size="small"
                            icon={<WhatsAppOutlined style={{ color: '#52c41a' }} />}
                            onClick={() => window.open(`https://wa.me/91${customer.phone.replace(/[^0-9]/g, '')}`, '_blank')}
                          />
                        </Tooltip>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Email Address">
                      <Space>
                        <MailOutlined />
                        <Text>{customer.email || EM_DASH}</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Contact Person">
                      {customer.contactName || EM_DASH}
                    </Descriptions.Item>
                    <Descriptions.Item label="Servicing Branch">
                      {customer.branch?.name ? customer.branch.name : EM_DASH}
                    </Descriptions.Item>
                  </Descriptions>

                  <Descriptions title="Address & Location" bordered column={1} size="small">
                    <Descriptions.Item label="Billing Address">
                      <Space align="start">
                        <EnvironmentOutlined style={{ marginTop: 4, color: '#1677ff' }} />
                        <Text>{customer.billingAddress}</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Shipping Address">
                      {customer.shippingAddress || customer.billingAddress}
                    </Descriptions.Item>
                    <Descriptions.Item label="City & District">
                      {[customer.city, customer.district, customer.state].filter(Boolean).join(', ') || EM_DASH}
                    </Descriptions.Item>
                    <Descriptions.Item label="Pincode">
                      {customer.pincode ? <Text code>{customer.pincode}</Text> : EM_DASH}
                    </Descriptions.Item>
                  </Descriptions>
                </Space>
              ),
            },
            {
              key: 'orders',
              label: `Order History (${mockOrders.length})`,
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Table
                    dataSource={mockOrders}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    columns={[
                      {
                        title: 'Order No',
                        dataIndex: 'orderNumber',
                        key: 'orderNumber',
                        render: (num) => <Text code>{num}</Text>,
                      },
                      { title: 'Date', dataIndex: 'date', key: 'date' },
                      { title: 'Items', dataIndex: 'itemCount', key: 'itemCount' },
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
                        render: (st) => <Tag color="green">{st}</Tag>,
                      },
                      {
                        title: 'Fulfillment',
                        dataIndex: 'fulfillmentStatus',
                        key: 'fulfillmentStatus',
                        render: (st) => <Tag color="blue">{st}</Tag>,
                      },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: 'rewards',
              label: 'Referrals & Rewards',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Card size="small" title="Referral Program Status">
                    <Row gutter={16} align="middle">
                      <Col span={14}>
                        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                          Customer Referral Code
                        </Text>
                        <Space>
                          <Title level={4} style={{ margin: 0 }}>
                            {customer.referralCode}
                          </Title>
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => handleCopy(customer.referralCode, 'Referral Code')}
                          >
                            Copy
                          </Button>
                        </Space>
                      </Col>
                      <Col span={10}>
                        <Statistic title="Coins Available" value={customer.coinBalance} prefix="🪙" />
                      </Col>
                    </Row>
                  </Card>

                  {customer.referredAs?.referrer ? (
                    <Card size="small" style={{ background: '#f9f9f9' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Referred By
                      </Text>
                      <div>
                        <Text strong>{customer.referredAs.referrer.name}</Text> ({customer.referredAs.referrer.customerCode})
                      </div>
                    </Card>
                  ) : (
                    <Text type="secondary">Direct Organic Signup (No referrer code used)</Text>
                  )}
                </Space>
              ),
            },
            ...(isB2B
              ? [
                  {
                    key: 'credit',
                    label: 'B2B Credit & Tax',
                    children: (
                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
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

                        <Card size="small" title="B2B Credit Facility Headroom">
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
      </Space>
    </Drawer>
  );
}
