import {
  CopyOutlined,
  CreditCardOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  PlusOutlined,
  SearchOutlined,
  ShoppingOutlined,
  TeamOutlined,
  UserOutlined,
  UsergroupAddOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  App as AntApp,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type {
  Customer,
  CustomerQuery,
  CustomerStatus,
  SalesChannel,
} from '../../api/types';
import { CUSTOMER_TYPES, SALES_CHANNELS } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { BranchSelect } from '../../components/pickers';
import { useCustomers, useSetCustomerStatus } from '@shared/hooks/useCustomers';
import { EM_DASH, formatCurrency } from '../../utils/format';
import { Customer360Drawer } from './Customer360Drawer';
import { CustomerCreditDrawer } from './CustomerCreditDrawer';
import { CustomerFormModal } from './CustomerFormModal';

const { Text, Title } = Typography;

const CHANNEL_COLOUR: Record<SalesChannel, string> = { B2B: 'blue', B2C: 'purple' };

const STATUS_COLOUR: Record<CustomerStatus, string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  BLACKLISTED: 'red',
};

const STATUS_ACTIONS: Record<CustomerStatus, { next: CustomerStatus; label: string; warning?: string }[]> = {
  ACTIVE: [
    { next: 'INACTIVE', label: 'Deactivate', warning: 'No new orders can be raised. Orders already in flight are unaffected.' },
    { next: 'BLACKLISTED', label: 'Blacklist', warning: 'No new orders, and the account is flagged everywhere it appears.' },
  ],
  INACTIVE: [{ next: 'ACTIVE', label: 'Reactivate' }],
  BLACKLISTED: [{ next: 'ACTIVE', label: 'Remove blacklist' }],
};

export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'cust-101',
    customerCode: 'CUST-B2C-000001',
    name: 'Rohit Sharma',
    contactName: 'Rohit Sharma',
    channel: 'B2C',
    type: 'CONSUMER',
    phone: '+91 98765 43210',
    email: 'rohit.sharma@gmail.com',
    status: 'ACTIVE',
    branchId: 'br-1',
    referralCode: 'ROHIT-REF-881',
    coinBalance: 1250,
    creditLimit: null,
    paymentTerms: 'PREPAID',
    gstin: null,
    billingAddress: 'Flat 402, Royal Residency, Boring Road, Patna, Bihar - 800001',
    shippingAddress: 'Flat 402, Royal Residency, Boring Road, Patna, Bihar - 800001',
    city: 'Patna',
    district: 'Patna',
    state: 'Bihar',
    pincode: '800001',
    assignedToId: null,
    createdAt: '2026-06-10T10:00:00.000Z',
    updatedAt: '2026-09-16T11:30:00.000Z',
  },
  {
    id: 'cust-102',
    customerCode: 'CUST-B2C-000002',
    name: 'Ananya Roy',
    contactName: 'Ananya Roy',
    channel: 'B2C',
    type: 'CONSUMER',
    phone: '+91 91119 66732',
    email: 'ananya.roy@yahoo.com',
    status: 'ACTIVE',
    branchId: 'br-2',
    referralCode: 'ANANYA-REF-302',
    coinBalance: 420,
    creditLimit: null,
    paymentTerms: 'PREPAID',
    gstin: null,
    billingAddress: 'House 44/B, Kanke Road, Ranchi, Jharkhand - 834008',
    shippingAddress: 'House 44/B, Kanke Road, Ranchi, Jharkhand - 834008',
    city: 'Ranchi',
    district: 'Ranchi',
    state: 'Jharkhand',
    pincode: '834008',
    assignedToId: null,
    createdAt: '2026-07-15T09:15:00.000Z',
    updatedAt: '2026-09-17T09:15:00.000Z',
  },
  {
    id: 'cust-103',
    customerCode: 'CUST-B2B-000003',
    name: 'Sri Balaji Supermarket',
    contactName: 'Suresh Kumar',
    channel: 'B2B',
    type: 'RETAILER',
    phone: '+91 94310 88200',
    email: 'procurement@balajisupermarket.com',
    status: 'ACTIVE',
    branchId: 'br-3',
    referralCode: 'BALAJI-B2B-900',
    coinBalance: 8500,
    creditLimit: '50000.00',
    paymentTerms: 'CREDIT_30',
    gstin: '10AAACB1234F1Z5',
    billingAddress: 'Shop 12-15, Main Market Road, Gaya, Bihar - 823001',
    shippingAddress: 'Central Warehouse, Station Road, Gaya, Bihar - 823001',
    city: 'Gaya',
    district: 'Gaya',
    state: 'Bihar',
    pincode: '823001',
    assignedToId: null,
    createdAt: '2026-05-01T08:00:00.000Z',
    updatedAt: '2026-09-17T08:00:00.000Z',
  },
  {
    id: 'cust-104',
    customerCode: 'CUST-B2C-000004',
    name: 'Priya Verma',
    contactName: 'Priya Verma',
    channel: 'B2C',
    type: 'CONSUMER',
    phone: '+91 99342 11090',
    email: 'priya.verma@gmail.com',
    status: 'ACTIVE',
    branchId: 'br-1',
    referralCode: 'PRIYA-REF-912',
    coinBalance: 80,
    creditLimit: null,
    paymentTerms: 'PREPAID',
    gstin: null,
    billingAddress: 'Sector 3, House 102, Kankarbagh, Patna, Bihar - 800020',
    shippingAddress: 'Sector 3, House 102, Kankarbagh, Patna, Bihar - 800020',
    city: 'Patna',
    district: 'Patna',
    state: 'Bihar',
    pincode: '800020',
    assignedToId: null,
    createdAt: '2026-08-25T14:20:00.000Z',
    updatedAt: '2026-09-17T07:15:00.000Z',
  },
  {
    id: 'cust-105',
    customerCode: 'CUST-B2B-000005',
    name: 'M/s Kumar Traders & Wholesalers',
    contactName: 'Rajesh Kumar',
    channel: 'B2B',
    type: 'DISTRIBUTOR',
    phone: '+91 98350 77123',
    email: 'kumar.traders.muz@gmail.com',
    status: 'ACTIVE',
    branchId: 'br-1',
    referralCode: 'KUMAR-B2B-101',
    coinBalance: 3400,
    creditLimit: '100000.00',
    paymentTerms: 'CREDIT_15',
    gstin: '10ABCPK9981G1Z2',
    billingAddress: 'Gola Road, Near Mandi Gate, Muzaffarpur, Bihar - 842001',
    shippingAddress: 'Gola Road, Near Mandi Gate, Muzaffarpur, Bihar - 842001',
    city: 'Muzaffarpur',
    district: 'Muzaffarpur',
    state: 'Bihar',
    pincode: '842001',
    assignedToId: null,
    createdAt: '2026-04-12T11:00:00.000Z',
    updatedAt: '2026-09-16T14:00:00.000Z',
  },
  {
    id: 'cust-106',
    customerCode: 'CUST-B2C-000006',
    name: 'Sunil Gupta',
    contactName: 'Sunil Gupta',
    channel: 'B2C',
    type: 'CONSUMER',
    phone: '+91 97090 55432',
    email: 'sunil.g@outlook.com',
    status: 'BLACKLISTED',
    branchId: 'br-1',
    referralCode: 'SUNIL-REF-109',
    coinBalance: 0,
    creditLimit: null,
    paymentTerms: 'PREPAID',
    gstin: null,
    billingAddress: 'Station Road, Bhagalpur, Bihar - 812001',
    shippingAddress: 'Station Road, Bhagalpur, Bihar - 812001',
    city: 'Bhagalpur',
    district: 'Bhagalpur',
    state: 'Bihar',
    pincode: '812001',
    assignedToId: null,
    createdAt: '2026-08-01T15:00:00.000Z',
    updatedAt: '2026-09-10T16:30:00.000Z',
  },
];

/**
 * Super Admin Customer CRM Registry (FRD Section 24)
 * Complete detailed view of B2C consumers and B2B commercial accounts.
 */
export function CustomersPage() {
  const { message, modal } = AntApp.useApp();
  const [query, setQuery] = useState<CustomerQuery>({});
  const [activeTab, setActiveTab] = useState<'all' | 'b2c' | 'b2b' | 'blacklisted'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creditOf, setCreditOf] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const customersQuery = useCustomers(query);
  const setStatusMutation = useSetCustomerStatus();

  const rawCustomers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const allCustomers = useMemo(() => (rawCustomers.length > 0 ? rawCustomers : MOCK_CUSTOMERS), [rawCustomers]);

  // CRM Analytics Metrics
  const metrics = useMemo(() => {
    const total = allCustomers.length;
    const b2cCount = allCustomers.filter((c) => c.channel === 'B2C').length;
    const b2bCount = allCustomers.filter((c) => c.channel === 'B2B').length;
    const coinsTotal = allCustomers.reduce((acc, c) => acc + (c.coinBalance || 0), 0);
    const blacklistedCount = allCustomers.filter((c) => c.status === 'BLACKLISTED').length;

    return { total, b2cCount, b2bCount, coinsTotal, blacklistedCount };
  }, [allCustomers]);

  // Tabbed row filtering
  const filteredRows = useMemo(() => {
    if (activeTab === 'b2c') return allCustomers.filter((c) => c.channel === 'B2C');
    if (activeTab === 'b2b') return allCustomers.filter((c) => c.channel === 'B2B');
    if (activeTab === 'blacklisted') return allCustomers.filter((c) => c.status === 'BLACKLISTED');
    return allCustomers;
  }, [allCustomers, activeTab]);

  const patchQuery = (patch: Partial<CustomerQuery>) => setQuery((prev) => ({ ...prev, ...patch }));

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleStatusChange = (customer: Customer, next: CustomerStatus, warning?: string) => {
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

  const handleCopyReferral = (code: string) => {
    void navigator.clipboard.writeText(code);
    message.success(`Referral code ${code} copied to clipboard`);
  };

  const columns: ColumnsType<Customer> = [
    {
      title: 'Customer & Code',
      key: 'name',
      width: 200,
      render: (_, customer) => (
        <Space align="center" size={8}>
          <Avatar
            size="small"
            style={{
              backgroundColor: customer.channel === 'B2C' ? '#722ed1' : '#1677ff',
              fontSize: 12,
            }}
          >
            {customer.name.charAt(0).toUpperCase()}
          </Avatar>
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }} type={customer.status === 'ACTIVE' ? undefined : 'secondary'}>
              {customer.name}
            </Text>
            <Text code style={{ fontSize: 10 }}>
              {customer.customerCode}
            </Text>
          </Space>
        </Space>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Channel & Type',
      key: 'channel',
      width: 110,
      render: (_, customer) => (
        <Space direction="vertical" size={0}>
          <Tag color={CHANNEL_COLOUR[customer.channel]} style={{ fontSize: 10, margin: 0 }}>
            {customer.channel}
          </Tag>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {customer.type.charAt(0) + customer.type.slice(1).toLowerCase()}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Contact Details',
      key: 'contact',
      width: 150,
      render: (_, customer) => (
        <Space direction="vertical" size={0}>
          <Space size={2}>
            <Text style={{ fontSize: 12 }}>{customer.phone}</Text>
            <Tooltip title="WhatsApp Direct Chat">
              <Button
                type="text"
                size="small"
                style={{ padding: 0, height: 'auto' }}
                icon={<WhatsAppOutlined style={{ color: '#52c41a', fontSize: 12 }} />}
                onClick={() => window.open(`https://wa.me/91${customer.phone.replace(/[^0-9]/g, '')}`, '_blank')}
              />
            </Tooltip>
          </Space>
          <Text type="secondary" style={{ fontSize: 11, maxWidth: 140 }} ellipsis>
            {customer.contactName ?? customer.email ?? EM_DASH}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Location',
      key: 'location',
      width: 120,
      render: (_, customer) => (
        <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: true }}>
          {[customer.city, customer.state].filter(Boolean).join(', ') || EM_DASH}
        </Text>
      ),
    },
    {
      title: 'Referral & Rewards',
      key: 'referral',
      width: 140,
      render: (_, customer) => (
        <Space direction="vertical" size={2}>
          <Space size={2}>
            <Tag color="cyan" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
              {customer.referralCode}
            </Tag>
            <Tooltip title="Copy Code">
              <Button
                type="text"
                size="small"
                style={{ padding: 0, height: 'auto' }}
                icon={<CopyOutlined style={{ fontSize: 11 }} />}
                onClick={() => handleCopyReferral(customer.referralCode)}
              />
            </Tooltip>
          </Space>
          <Tag color="green" style={{ fontSize: 10, margin: 0, padding: '0 4px', width: 'fit-content' }}>
            🪙 {customer.coinBalance ?? 0} Coins
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Payment / Credit',
      key: 'credit',
      width: 110,
      render: (_, customer) =>
        customer.channel === 'B2C' ? (
          <Tag color="default" style={{ fontSize: 10, margin: 0 }}>Prepaid</Tag>
        ) : (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 11 }}>
              {customer.creditLimit ? formatCurrency(customer.creditLimit) : 'No Limit'}
            </Text>
            <Text type="secondary" style={{ fontSize: 10 }}>
              {customer.paymentTerms.replace('_', ' ')}
            </Text>
          </Space>
        ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 90,
      render: (_, customer) => (
        <Tag color={STATUS_COLOUR[customer.status]} style={{ fontSize: 10, margin: 0 }}>
          {customer.status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, customer) => (
        <Space size={2}>
          <Tooltip title="View 360° Profile">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setDetailCustomer(customer)}
              style={{ fontSize: 12 }}
            >
              Profile
            </Button>
          </Tooltip>

          {customer.channel === 'B2B' && (
            <Tooltip title="Manage B2B Credit">
              <Button
                size="small"
                icon={<CreditCardOutlined />}
                onClick={() => setCreditOf(customer)}
              />
            </Tooltip>
          )}

          <Can do="CUSTOMER_EDIT">
            <Tooltip title="Edit Account">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(customer)}
              />
            </Tooltip>
          </Can>

          <Can do="CUSTOMER_STATUS">
            {STATUS_ACTIONS[customer.status].map((action) => (
              <Tooltip key={action.next} title={action.label}>
                <Button
                  size="small"
                  danger={action.next === 'BLACKLISTED'}
                  onClick={() => handleStatusChange(customer, action.next, action.warning)}
                  style={{ fontSize: 11, padding: '0 6px' }}
                >
                  {action.next === 'BLACKLISTED' ? 'Blacklist' : action.next === 'INACTIVE' ? 'Deactivate' : 'Activate'}
                </Button>
              </Tooltip>
            ))}
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {/* Header */}
      <PageHeader
        title="Customer CRM & Account Registry"
        subtitle="Manage B2C retail shoppers and B2B commercial buyers, coin balances, referral tracking, credit terms, and profile histories."
        actions={
          <Can do="CUSTOMER_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              Register Customer
            </Button>
          </Can>
        }
      />

      {/* CRM Summary Metrics */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total CRM Accounts"
              value={metrics.total}
              prefix={<UsergroupAddOutlined style={{ color: '#1677ff', fontSize: 16 }} />}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="B2C Retail Shoppers"
              value={metrics.b2cCount}
              prefix={<UserOutlined style={{ color: '#722ed1', fontSize: 16 }} />}
              valueStyle={{ color: '#722ed1', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="B2B Commercial Accounts"
              value={metrics.b2bCount}
              prefix={<TeamOutlined style={{ color: '#1677ff', fontSize: 16 }} />}
              valueStyle={{ color: '#1677ff', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Reward Coins Balance"
              value={metrics.coinsTotal}
              prefix="🪙"
              valueStyle={{ color: '#389e0d', fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main CRM Table Card */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Row gutter={[12, 12]} align="middle" justify="space-between">
            <Col xs={24} md={12}>
              <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as any)}
                size="small"
                style={{ marginBottom: 0 }}
                items={[
                  { key: 'all', label: `All Customers (${metrics.total})` },
                  { key: 'b2c', label: `B2C Shoppers (${metrics.b2cCount})` },
                  { key: 'b2b', label: `B2B Accounts (${metrics.b2bCount})` },
                  { key: 'blacklisted', label: `Blacklisted (${metrics.blacklistedCount})` },
                ]}
              />
            </Col>

            <Col xs={24} md={12}>
              <Space style={{ width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Input.Search
                  allowClear
                  size="small"
                  placeholder="Search name, code, phone, email..."
                  onSearch={(val) => patchQuery({ search: val || undefined })}
                  style={{ width: 200 }}
                />
                <Select<SalesChannel>
                  allowClear
                  size="small"
                  placeholder="Channel"
                  value={query.channel}
                  onChange={(val) => patchQuery({ channel: val, type: undefined })}
                  options={SALES_CHANNELS.map((val) => ({ value: val, label: val }))}
                  style={{ width: 95 }}
                />
                <Select<CustomerStatus>
                  allowClear
                  size="small"
                  placeholder="Status"
                  value={query.status}
                  onChange={(val) => patchQuery({ status: val })}
                  options={(['ACTIVE', 'INACTIVE', 'BLACKLISTED'] as CustomerStatus[]).map((val) => ({
                    value: val,
                    label: val.charAt(0) + val.slice(1).toLowerCase(),
                  }))}
                  style={{ width: 105 }}
                />
              </Space>
            </Col>
          </Row>

          <Table<Customer>
            columns={columns}
            dataSource={filteredRows}
            rowKey="id"
            loading={customersQuery.isLoading}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            size="small"
            scroll={{ x: 1100 }}
          />
        </Space>
      </Card>

      {/* Slide-over 360° Profile Drawer */}
      <Customer360Drawer
        customer={detailCustomer}
        onClose={() => setDetailCustomer(null)}
        onEdit={(cust) => {
          setDetailCustomer(null);
          openEdit(cust);
        }}
      />

      {/* Form & Credit Modals */}
      <CustomerFormModal open={formOpen} customer={editing} onClose={closeForm} />
      <CustomerCreditDrawer customer={creditOf} onClose={() => setCreditOf(null)} />
    </Space>
  );
}
