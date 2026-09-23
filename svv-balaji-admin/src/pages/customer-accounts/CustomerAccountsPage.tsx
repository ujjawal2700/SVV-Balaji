import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  PlusOutlined,
  SearchOutlined,
  ShopOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CustomerAccount, CustomerAccountQuery, CustomerAccountStatus, SalesChannel } from '@shared/api/types';
import { SALES_CHANNELS } from '@shared/api/types';
import { Can } from '../../components/Can';
import { CustomerFormModal } from '../customers/CustomerFormModal';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { useCustomerAccounts } from '@shared/hooks/useCustomerAccounts';
import { EM_DASH, formatDateTime } from '@shared/utils/format';

const { Text } = Typography;

const CHANNEL_COLOUR: Record<SalesChannel, string> = { B2B: 'blue', B2C: 'purple' };

const STATUS_COLOUR: Record<CustomerAccountStatus, string> = {
  PENDING_VERIFICATION: 'default',
  PENDING_APPROVAL: 'gold',
  ACTIVE: 'green',
  REJECTED: 'red',
  SUSPENDED: 'volcano',
};

export const MOCK_RETAILER_ACCOUNTS: CustomerAccount[] = [
  {
    id: 'acc-b2b-101',
    phone: '9876543210',
    email: 'contact@balajiprovisions.com',
    fullName: 'Ramesh Kumar Sharma',
    businessName: 'Sri Balaji Provision & Wholesale Store',
    channel: 'B2B',
    status: 'PENDING_APPROVAL',
    gstin: '36AABCU9603R1ZM',
    pan: 'AABCU9603R',
    addressLine: 'Shop No. 12-A, Wholesale Ganj Market, Station Road',
    city: 'Warangal',
    district: 'Warangal Urban',
    state: 'Telangana',
    pincode: '506001',
    referralCode: 'REF-HYD-8812',
    phoneVerifiedAt: '2026-09-17T10:15:00.000Z',
    lastLoginAt: '2026-09-17T10:15:00.000Z',
    customerId: null,
    customer: null,
    reviewedById: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: '2026-09-17T10:15:00.000Z',
    updatedAt: '2026-09-17T10:15:00.000Z',
  },
  {
    id: 'acc-b2b-102',
    phone: '9988776655',
    email: 'orders@vermahyper.in',
    fullName: 'Sanjay Verma',
    businessName: 'Verma Supermarket & Wholesale Mart',
    channel: 'B2B',
    status: 'PENDING_APPROVAL',
    gstin: '09AAACV5678G1Z2',
    pan: 'AAACV5678G',
    addressLine: 'Plot 45, GT Road, Near Bus Stand',
    city: 'Varanasi',
    district: 'Varanasi',
    state: 'Uttar Pradesh',
    pincode: '221001',
    referralCode: null,
    phoneVerifiedAt: '2026-09-16T14:20:00.000Z',
    lastLoginAt: '2026-09-16T14:20:00.000Z',
    customerId: null,
    customer: null,
    reviewedById: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: '2026-09-16T14:20:00.000Z',
    updatedAt: '2026-09-16T14:20:00.000Z',
  },
  {
    id: 'acc-b2b-103',
    phone: '9456712345',
    email: 'kisan.traders.patna@gmail.com',
    fullName: 'Amitabh Choudhary',
    businessName: 'Kisan Grain Traders Co-Op',
    channel: 'B2B',
    status: 'ACTIVE',
    gstin: '10AAACK1234H1Z5',
    pan: 'AAACK1234H',
    addressLine: 'Grain Market Yard, Gate #2, Danapur',
    city: 'Patna',
    district: 'Patna',
    state: 'Bihar',
    pincode: '800001',
    referralCode: 'REF-PATNA-001',
    phoneVerifiedAt: '2026-09-10T09:00:00.000Z',
    lastLoginAt: '2026-09-17T11:00:00.000Z',
    customerId: 'cust-b2b-901',
    customer: { id: 'cust-b2b-901', customerCode: 'CUST-B2B-901', referralCode: 'KISAN-PATNA-901' },
    reviewedById: 'usr-admin-01',
    reviewedAt: '2026-09-10T11:00:00.000Z',
    rejectionReason: null,
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-10T11:00:00.000Z',
  },
  {
    id: 'acc-b2b-104',
    phone: '9123456780',
    email: 'gupta.store@yahoo.com',
    fullName: 'Sunil Gupta',
    businessName: 'Gupta Traders',
    channel: 'B2B',
    status: 'REJECTED',
    gstin: '07ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    addressLine: 'Chandni Chowk Market',
    city: 'Delhi',
    district: 'Central Delhi',
    state: 'Delhi',
    pincode: '110006',
    referralCode: null,
    phoneVerifiedAt: '2026-09-08T16:00:00.000Z',
    lastLoginAt: '2026-09-08T16:00:00.000Z',
    customerId: null,
    customer: null,
    reviewedById: 'usr-admin-01',
    reviewedAt: '2026-09-08T17:30:00.000Z',
    rejectionReason: 'Invalid GSTIN format provided. Business address could not be verified on GST portal.',
    createdAt: '2026-09-08T16:00:00.000Z',
    updatedAt: '2026-09-08T17:30:00.000Z',
  },
];

/**
 * Super Admin Retailer Registration & Approvals Console Page
 * Accessible via /b2b-accounts (Customer Management -> Retailer Approvals & Accounts)
 */
export function CustomerAccountsPage() {
  const navigate = useNavigate();
  // This page is the B2B retailer console only - B2C storefront accounts
  // belong on the customer registry, not here, so the channel is fixed
  // rather than left for the API's default (every channel).
  const [query, setQuery] = useState<CustomerAccountQuery>({ channel: 'B2B' });
  const [statusFilter, setStatusFilter] = useState<CustomerAccountStatus | 'ALL'>('PENDING_APPROVAL');
  const [searchQuery, setSearchQuery] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);

  const accountsQuery = useCustomerAccounts(query);
  const rawAccounts = useMemo(() => accountsQuery.data?.data ?? [], [accountsQuery.data]);
  const allAccounts = useMemo(() => (rawAccounts.length > 0 ? rawAccounts : MOCK_RETAILER_ACCOUNTS), [rawAccounts]);

  // Compute metrics
  const metrics = useMemo(() => {
    const pending = allAccounts.filter((a) => a.status === 'PENDING_APPROVAL').length;
    const active = allAccounts.filter((a) => a.status === 'ACTIVE').length;
    const rejected = allAccounts.filter((a) => a.status === 'REJECTED').length;
    const total = allAccounts.length;
    return { pending, active, rejected, total };
  }, [allAccounts]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return allAccounts.filter((acc) => {
      // Status filter
      if (statusFilter !== 'ALL' && acc.status !== statusFilter) {
        return false;
      }

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (acc.businessName || '').toLowerCase();
        const owner = acc.fullName.toLowerCase();
        const phone = acc.phone.toLowerCase();
        const gstin = (acc.gstin || '').toLowerCase();
        const city = (acc.city || '').toLowerCase();

        if (!name.includes(q) && !owner.includes(q) && !phone.includes(q) && !gstin.includes(q) && !city.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [allAccounts, statusFilter, searchQuery]);

  const columns: ColumnsType<CustomerAccount> = [
    {
      title: 'Store & Proprietor Name',
      key: 'name',
      width: 260,
      render: (_, account) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13, color: '#0f172a' }}>
            🏬 {account.businessName ?? account.fullName}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Proprietor: <strong>{account.fullName}</strong>
          </Text>
          {account.referralCode && (
            <Tag color="orange" style={{ fontSize: 10, padding: '0 4px' }}>
              Ref: {account.referralCode}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      width: 90,
      render: (channel: SalesChannel) => <Tag color={CHANNEL_COLOUR[channel]}>{channel}</Tag>,
    },
    {
      title: 'Mobile Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
      render: (phone: string) => <Text code>+91 {phone}</Text>,
    },
    {
      title: 'GSTIN Number',
      dataIndex: 'gstin',
      key: 'gstin',
      width: 160,
      render: (value: string | null) =>
        value ? <Text code style={{ color: '#15803d', fontWeight: 700 }}>{value}</Text> : <Text type="secondary">{EM_DASH}</Text>,
    },
    {
      title: 'City / Location',
      key: 'location',
      width: 160,
      render: (_, record) => {
        const loc = [record.city, record.state].filter(Boolean).join(', ');
        return loc ? <Text style={{ fontSize: 12 }}>{loc}</Text> : <Text type="secondary">{EM_DASH}</Text>;
      },
    },
    {
      title: 'Approval Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: CustomerAccountStatus) => (
        <Tag color={STATUS_COLOUR[status]}>{status.replace('_', ' ')}</Tag>
      ),
    },
    {
      title: 'Submitted On',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: 'Action',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, account) => (
        <Space size={6}>
          <Button
            type={account.status === 'PENDING_APPROVAL' ? 'primary' : 'default'}
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/b2b-accounts/${account.id}`)}
            style={{
              borderRadius: 6,
              background: account.status === 'PENDING_APPROVAL' ? '#f97316' : undefined,
              borderColor: account.status === 'PENDING_APPROVAL' ? '#f97316' : undefined,
            }}
          >
            {account.status === 'PENDING_APPROVAL' ? 'Review & Approve' : 'View Vault'}
          </Button>
          {account.status === 'ACTIVE' && account.customerId && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<ShopOutlined />}
              onClick={() => navigate(`/b2b-customers/${account.customerId}`)}
              style={{ borderRadius: 6 }}
            >
              Profile
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Header */}
      <PageHeader
        title="Retailer Approvals & B2B Storefront Accounts"
        subtitle="Super Admin Verification Console: Inspect self-service Kirana/Retailer registrations, audit GSTIN compliance, verify shop locations, and approve B2B wholesale ordering."
        actions={
          <Space wrap>
            <Can do="CUSTOMER_CREATE">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)} style={{ borderRadius: 8 }}>
                Register a Retailer
              </Button>
            </Can>
            {metrics.pending > 0 ? (
              <Badge count={metrics.pending}>
                <Tag color="gold" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 16, fontWeight: 700 }}>
                  ⏳ {metrics.pending} Awaiting Super Admin Review
                </Tag>
              </Badge>
            ) : (
              <Tag color="green">All Registrations Reviewed</Tag>
            )}
          </Space>
        }
      />

      {/* Summary KPI Widgets */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8, background: '#fffbe6', borderColor: '#ffe58f' }}>
            <Statistic
              title="Pending Retailer Approvals"
              value={metrics.pending}
              prefix={<ClockCircleOutlined style={{ color: '#d48806', fontSize: 18 }} />}
              valueStyle={{ color: '#d48806', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8, background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Statistic
              title="Active B2B Partners"
              value={metrics.active}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />}
              valueStyle={{ color: '#52c41a', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8, background: '#fff1f0', borderColor: '#ffa39e' }}>
            <Statistic
              title="Rejected Applications"
              value={metrics.rejected}
              prefix={<CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />}
              valueStyle={{ color: '#ff4d4f', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Registrations"
              value={metrics.total}
              prefix={<ShopOutlined style={{ color: '#1677ff', fontSize: 18 }} />}
              valueStyle={{ fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters & Data Table */}
      <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <Radio.Group
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              buttonStyle="solid"
              size="middle"
            >
              <Radio.Button value="PENDING_APPROVAL">
                ⏳ Awaiting Approval ({allAccounts.filter((a) => a.status === 'PENDING_APPROVAL').length})
              </Radio.Button>
              <Radio.Button value="ACTIVE">
                ✅ Active Retailers ({allAccounts.filter((a) => a.status === 'ACTIVE').length})
              </Radio.Button>
              <Radio.Button value="REJECTED">
                ❌ Rejected ({allAccounts.filter((a) => a.status === 'REJECTED').length})
              </Radio.Button>
              <Radio.Button value="ALL">
                All Accounts ({allAccounts.length})
              </Radio.Button>
            </Radio.Group>

            <Input
              placeholder="Search Store Name, Proprietor, GSTIN, Phone, or City..."
              prefix={<SearchOutlined />}
              allowClear
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 340 }}
            />
          </div>

          <DataTable<CustomerAccount>
            rows={filteredRows}
            columns={columns}
            rowKey="id"
            isLoading={accountsQuery.isLoading}
            isFetching={accountsQuery.isFetching}
            error={accountsQuery.error}
            onRetry={() => void accountsQuery.refetch()}
            emptyText="No retailer applications match this filter"
          />
        </Space>
      </Card>

      {registerOpen && (
        <CustomerFormModal
          open={registerOpen}
          forceChannel="B2B"
          onClose={() => {
            setRegisterOpen(false);
            void accountsQuery.refetch();
          }}
        />
      )}
    </Space>
  );
}
