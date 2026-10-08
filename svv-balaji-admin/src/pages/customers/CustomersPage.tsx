import {
  CopyOutlined,
  CreditCardOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  MoreOutlined,
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
  Dropdown,
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
import { useNavigate } from 'react-router-dom';
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

/**
 * Super Admin B2C Customer CRM Registry (FRD Section 24)
 * Dedicated management for B2C retail shoppers and consumer accounts.
 */
export function CustomersPage() {
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();
  const [query, setQuery] = useState<CustomerQuery>({ channel: 'B2C' });
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'blacklisted'>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creditOf, setCreditOf] = useState<Customer | null>(null);

  const customersQuery = useCustomers(query);
  const setStatusMutation = useSetCustomerStatus();

  const allCustomers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);

  // Strictly filter to B2C retail shoppers on this page
  const b2cCustomers = useMemo(() => allCustomers.filter((c) => c.channel === 'B2C'), [allCustomers]);

  // B2C CRM Analytics Metrics
  const metrics = useMemo(() => {
    const total = b2cCustomers.length;
    const activeCount = b2cCustomers.filter((c) => c.status === 'ACTIVE').length;
    const blacklistedCount = b2cCustomers.filter((c) => c.status === 'BLACKLISTED').length;
    const coinsTotal = b2cCustomers.reduce((acc, c) => acc + (c.coinBalance || 0), 0);

    return { total, activeCount, blacklistedCount, coinsTotal };
  }, [b2cCustomers]);

  // Tabbed row filtering
  const filteredRows = useMemo(() => {
    if (activeTab === 'active') return b2cCustomers.filter((c) => c.status === 'ACTIVE');
    if (activeTab === 'blacklisted') return b2cCustomers.filter((c) => c.status === 'BLACKLISTED');
    return b2cCustomers;
  }, [b2cCustomers, activeTab]);

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
      width: 210,
      render: (_, customer) => (
        <Space align="center" size={10}>
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
            <Text
              style={{ fontSize: 13, cursor: 'pointer', color: '#1677ff', fontWeight: 600 }}
              onClick={() => navigate(`/b2c-customers/${customer.id}`)}
            >
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
      title: 'Contact Details',
      key: 'contact',
      width: 170,
      render: (_, customer) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            <Text style={{ fontSize: 12, fontWeight: 500 }}>{customer.phone}</Text>
            <Tooltip title="WhatsApp Direct Chat">
              <WhatsAppOutlined
                style={{ color: '#22c55e', fontSize: 13, cursor: 'pointer' }}
                onClick={() => window.open(`https://wa.me/91${customer.phone.replace(/[^0-9]/g, '')}`, '_blank')}
              />
            </Tooltip>
          </Space>
          <Text type="secondary" style={{ fontSize: 11, maxWidth: 150 }} ellipsis>
            {customer.contactName ?? customer.email ?? EM_DASH}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Location',
      key: 'location',
      width: 140,
      render: (_, customer) => (
        <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: true }}>
          {[customer.city, customer.state].filter(Boolean).join(', ') || EM_DASH}
        </Text>
      ),
    },
    {
      title: 'Referral & Rewards',
      key: 'referral',
      width: 160,
      render: (_, customer) => (
        <Space direction="vertical" size={2}>
          <Space size={4}>
            <Tag color="cyan" style={{ fontSize: 10, margin: 0, padding: '0 4px', fontWeight: 500 }}>
              {customer.referralCode}
            </Tag>
            <Tooltip title="Copy Code">
              <CopyOutlined
                style={{ fontSize: 11, cursor: 'pointer', color: '#64748b' }}
                onClick={() => handleCopyReferral(customer.referralCode)}
              />
            </Tooltip>
          </Space>
          <Tag color="green" style={{ fontSize: 10, margin: 0, padding: '0 4px', fontWeight: 500, width: 'fit-content' }}>
            🪙 {customer.coinBalance ?? 0} Coins
          </Tag>
        </Space>
      ),
    },

    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_, customer) => (
        <Tag color={STATUS_COLOUR[customer.status]} style={{ fontSize: 10, margin: 0, fontWeight: 500 }}>
          {customer.status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, customer) => (
        <Space size={6}>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<EyeOutlined />}
            onClick={() => navigate(`/b2c-customers/${customer.id}`)}
            style={{ borderRadius: 6, fontSize: 12, fontWeight: 500 }}
          >
            Profile
          </Button>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: 'Edit Customer',
                  onClick: () => openEdit(customer),
                },
                ...(customer.channel === 'B2B'
                  ? [
                      {
                        key: 'credit',
                        icon: <CreditCardOutlined />,
                        label: 'Manage B2B Credit',
                        onClick: () => setCreditOf(customer),
                      },
                    ]
                  : []),
                { type: 'divider' as const },
                ...STATUS_ACTIONS[customer.status].map((action) => ({
                  key: action.next,
                  danger: action.next === 'BLACKLISTED',
                  label: action.label,
                  onClick: () => handleStatusChange(customer, action.next, action.warning),
                })),
              ],
            }}
            trigger={['click']}
          >
            <Button size="small" icon={<MoreOutlined />} style={{ borderRadius: 6 }} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 8px 32px 8px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Header */}
        <PageHeader
          title="B2C Customer CRM & Shopper Registry"
          subtitle="Manage B2C retail shoppers, reward coin balances, referral tracking, and shopper account histories."
          actions={
            <Can do="CUSTOMER_CREATE">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)} style={{ borderRadius: 8 }}>
                Register B2C Customer
              </Button>
            </Can>
          }
        />

        {/* CRM Summary Metrics */}
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic
                title="Total B2C Shoppers"
                value={metrics.total}
                prefix={<UserOutlined style={{ color: '#722ed1', fontSize: 16 }} />}
                valueStyle={{ color: '#722ed1', fontSize: 20, fontWeight: 600 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic
                title="Active Shoppers"
                value={metrics.activeCount}
                prefix={<UsergroupAddOutlined style={{ color: '#389e0d', fontSize: 16 }} />}
                valueStyle={{ color: '#389e0d', fontSize: 20, fontWeight: 600 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic
                title="Blacklisted Accounts"
                value={metrics.blacklistedCount}
                prefix={<UserOutlined style={{ color: '#cf1322', fontSize: 16 }} />}
                valueStyle={{ color: '#cf1322', fontSize: 20, fontWeight: 600 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ borderRadius: 12 }}>
              <Statistic
                title="Reward Coins Balance"
                value={metrics.coinsTotal}
                prefix="🪙"
                valueStyle={{ color: '#d46b08', fontSize: 20, fontWeight: 600 }}
              />
            </Card>
          </Col>
        </Row>

        {/* Main CRM Table Card */}
        <Card bodyStyle={{ padding: '16px 20px' }} style={{ borderRadius: 12, border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Row gutter={[12, 12]} align="middle" justify="space-between">
              <Col xs={24} md={12}>
                <Tabs
                  activeKey={activeTab}
                  onChange={(key) => setActiveTab(key as any)}
                  size="small"
                  style={{ marginBottom: 0, fontWeight: 500 }}
                  items={[
                    { key: 'all', label: `All Shoppers (${metrics.total})` },
                    { key: 'active', label: `Active (${metrics.activeCount})` },
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
                    style={{ width: 220, borderRadius: 6 }}
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
                    style={{ width: 110 }}
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
              scroll={{ x: 900 }}
            />
          </Space>
        </Card>

        {/* Form & Credit Modals */}
        <CustomerFormModal open={formOpen} customer={editing} onClose={closeForm} />
        <CustomerCreditDrawer customer={creditOf} onClose={() => setCreditOf(null)} />
      </Space>
    </div>
  );
}
