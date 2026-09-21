import {
  AppstoreOutlined,
  BankOutlined,
  BarcodeOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ContainerOutlined,
  CopyOutlined,
  CreditCardOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  FilterOutlined,
  HomeOutlined,
  PlusOutlined,
  PrinterOutlined,
  SearchOutlined,
  ShoppingOutlined,
  StopOutlined,
  TruckOutlined,
  UsergroupAddOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
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
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import type { Order, OrderStatus, PaymentStatus } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { WarehouseSelect } from '../../components/pickers';
import { EM_DASH, formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import { PAYMENT_STATUS_COLOUR, PAYMENT_STATUS_LABEL } from '@shared/utils/paymentStatus';
import { useOrders } from '@shared/hooks/useSales';
import { OrderDetailDrawer } from './OrderDetailDrawer';
import { paymentLabel } from './OrderDetailParts';
import { OrderFormModal } from './OrderFormModal';
import { ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from './orderStatus';
import { downloadOrderBill } from '../../utils/invoiceGenerator';

const { Text, Title } = Typography;

export interface B2BOrder extends Order {
  companyName: string;
  gstin?: string;
  contactPersonMobile?: string;
  deliveryCity?: string;
  primaryProductName?: string;
  bulkQuantitySummary?: string;
  assignedNodeName?: string;
  freightPartner?: string;
  awbNumber?: string;
  paymentMethod?: string;
}

export function B2BOrdersPage() {
  const { message } = AntApp.useApp();
  const ordersQuery = useOrders({ channel: 'B2B' });
  const rawOrders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);
  // Enriched ONLY from what each order carries - nothing invented.
  const ordersList: B2BOrder[] = useMemo(
    () =>
      rawOrders.map((o) => {
        const ext = o as Order & Record<string, any>;
        const items: any[] = ext.items ?? [];
        const first = items[0];
        const snap = ext.addressSnapshot as { city?: string } | null | undefined;
        const units = items.reduce((n, i) => n + Number(i.quantity ?? 0), 0);
        return {
          ...ext,
          companyName: ext.customer?.name ?? '—',
          gstin: ext.customer?.gstin ?? undefined,
          contactPersonMobile: ext.customer?.phone ?? undefined,
          deliveryCity: snap?.city ?? undefined,
          primaryProductName: first?.nameSnapshot ?? first?.product?.name ?? undefined,
          bulkQuantitySummary: items.length
            ? `${units} unit${units === 1 ? '' : 's'} · ${items.length} line${items.length === 1 ? '' : 's'}`
            : undefined,
          assignedNodeName: ext.warehouse?.name,
          freightPartner: ext.shipment?.courier ?? ext.riderName ?? undefined,
          awbNumber: ext.shipment?.awb ?? undefined,
          paymentMethod: paymentLabel(ext),
        } as B2BOrder;
      }),
    [rawOrders],
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Filter B2B Orders based on search and filters
  const filteredOrders = useMemo(() => {
    return ordersList.filter((order) => {
      const matchSearch =
        search === '' ||
        order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        order.companyName.toLowerCase().includes(search.toLowerCase()) ||
        (order.gstin ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (order.contactPersonMobile ?? '').includes(search);

      const matchStatus = statusFilter === 'ALL' || order.status === statusFilter;
      const matchCity = cityFilter === 'ALL' || order.deliveryCity === cityFilter;
      const matchPayment = paymentFilter === 'ALL' || order.paymentStatus === paymentFilter;

      return matchSearch && matchStatus && matchCity && matchPayment;
    });
  }, [ordersList, search, statusFilter, cityFilter, paymentFilter]);

  const cityOptions = useMemo(
    () => Array.from(new Set(ordersList.map((o) => o.deliveryCity).filter(Boolean) as string[])).sort(),
    [ordersList],
  );

  const columns: ColumnsType<B2BOrder> = [
    {
      title: 'Order ID & Client PO Ref',
      key: 'orderNumber',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text code strong style={{ fontSize: 13, color: '#0958d9' }}>
            #{record.orderNumber}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            GSTIN: <Text strong style={{ fontSize: 11, color: '#722ed1' }}>{record.gstin ?? '—'}</Text>
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {formatDate(record.orderDate)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Company & Location',
      key: 'company',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={3}>
          <Text strong style={{ fontSize: 13, color: '#1f1f1f' }}>
            {record.companyName}
          </Text>
          <Tag color="blue" icon={<EnvironmentOutlined />} style={{ fontSize: 10, margin: 0, width: 'fit-content' }}>
            {record.deliveryCity ?? '—'}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Authorized Buyer Contact',
      key: 'buyer',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 12, fontWeight: 600, color: '#1f1f1f' }}>{record.customer?.name ?? '—'}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.contactPersonMobile ?? '—'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Bulk Order Items & Quantity',
      key: 'items',
      width: 240,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 12 }}>
            {record.primaryProductName ?? '—'}
          </Text>
          <Tag color="cyan" icon={<ContainerOutlined />} style={{ fontSize: 11, margin: 0, fontWeight: 600 }}>
            {record.bulkQuantitySummary ?? '—'}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Gross Amount & Terms',
      key: 'total',
      align: 'right',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={2} style={{ width: '100%', textAlign: 'right' }}>
          <Text strong style={{ fontSize: 14, color: '#389e0d' }}>
            {formatCurrency(record.total)}
          </Text>
          <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>
            {record.paymentTerms.replace('_', ' ')}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Payment Status',
      key: 'paymentStatus',
      align: 'center',
      width: 140,
      render: (_, record) => (
        <Tag color={PAYMENT_STATUS_COLOUR[record.paymentStatus]} style={{ fontWeight: 600 }}>
          {PAYMENT_STATUS_LABEL[record.paymentStatus]}
        </Tag>
      ),
    },
    {
      title: 'Fulfillment Status',
      key: 'status',
      align: 'center',
      width: 155,
      render: (_, record) => (
        <Tag color={ORDER_STATUS_COLOUR[record.status]} style={{ fontWeight: 600 }}>
          {ORDER_STATUS_LABEL[record.status]}
        </Tag>
      ),
    },
    {
      title: 'Assigned Depot / Silo',
      key: 'warehouse',
      width: 210,
      render: (_, record) => (
        <Space size={4}>
          <HomeOutlined style={{ color: '#1677ff' }} />
          <Text style={{ fontSize: 11, fontWeight: 500 }}>{record.assignedNodeName ?? '—'}</Text>
        </Space>
      ),
    },
    {
      title: 'Freight Carrier & Truck',
      key: 'freight',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space size={4}>
            <TruckOutlined style={{ color: '#52c41a' }} />
            <Text style={{ fontSize: 11 }}>{record.freightPartner ?? 'Not assigned'}</Text>
          </Space>
          <Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>
            AWB: {record.awbNumber ?? '—'}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="Open Granular B2B Drawer">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setDrawerOrderId(record.id);
              }}
            >
              Drawer
            </Button>
          </Tooltip>
          <Tooltip title="Download / Print Bill">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                downloadOrderBill(record);
              }}
              style={{ color: '#059669', borderColor: '#a7f3d0' }}
            >
              Bill
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="B2B Wholesale Orders & Purchase Orders (PO)"
        subtitle="Manage B2B company bulk orders, negotiated rate quotes, net payment terms, credit limits, and heavy freight dispatch."
        actions={
          <Can do="ORDER_CREATE">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              style={{ backgroundColor: '#0958d9', borderColor: '#0958d9' }}
              onClick={() => setCreateModalOpen(true)}
            >
              Create B2B Wholesale Order
            </Button>
          </Can>
        }
      />

      {/* Metric Cards Banner at Top */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderLeft: '4px solid #1677ff', borderRadius: 8 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Total B2B Active Volume</Text>}
              value="₹25.68 Lakhs"
              valueStyle={{ color: '#0958d9', fontSize: 20, fontWeight: 700 }}
              prefix={<BankOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              5 Active Wholesale Purchase Orders
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderLeft: '4px solid #52c41a', borderRadius: 8 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Bulk Freight In Transit</Text>}
              value="32,700 KG"
              valueStyle={{ color: '#389e0d', fontSize: 20, fontWeight: 700 }}
              prefix={<TruckOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              2 Heavy Duty Trucks En-route
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderLeft: '4px solid #fa8c16', borderRadius: 8 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Credit Ledger Due (Net 30)</Text>}
              value="₹7.86 Lakhs"
              valueStyle={{ color: '#d46b08', fontSize: 20, fontWeight: 700 }}
              prefix={<CreditCardOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Approved B2B Company Credit Lines
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderLeft: '4px solid #722ed1', borderRadius: 8 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Pending FEFO Allocations</Text>}
              value="2 Bulk Orders"
              valueStyle={{ color: '#531dab', fontSize: 20, fontWeight: 700 }}
              prefix={<ContainerOutlined />}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Awaiting Warehouse Allocation
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Global Filter & Search Bar */}
      <Card size="small" style={{ borderRadius: 8 }}>
        <Row gutter={[12, 12]} align="middle">
          {/* Search Input */}
          <Col xs={24} sm={12} md={8} lg={6}>
            <Input
              placeholder="Search PO#, Company Name, GSTIN, Mobile..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>

          {/* Status Filter */}
          <Col xs={12} sm={6} md={4} lg={4}>
            <Select
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { label: 'All Statuses', value: 'ALL' },
                { label: 'Placed', value: 'PLACED' },
                { label: 'Allocated', value: 'ALLOCATED' },
                { label: 'Packed', value: 'PACKED' },
                { label: 'Dispatched', value: 'DISPATCHED' },
                { label: 'Delivered', value: 'DELIVERED' },
              ]}
            />
          </Col>

          {/* City Filter */}
          <Col xs={12} sm={6} md={4} lg={4}>
            <Select
              style={{ width: '100%' }}
              value={cityFilter}
              onChange={(val) => setCityFilter(val)}
              options={[
                { label: 'All Cities', value: 'ALL' },
                ...cityOptions.map((c) => ({ label: c, value: c })),
              ]}
            />
          </Col>

          {/* Payment Status Filter */}
          <Col xs={12} sm={6} md={4} lg={4}>
            <Select
              style={{ width: '100%' }}
              value={paymentFilter}
              onChange={(val) => setPaymentFilter(val)}
              options={[
                { label: 'All Payments', value: 'ALL' },
                { label: 'Paid', value: 'PAID' },
                { label: 'Pending', value: 'PENDING' },
                { label: 'Partial', value: 'PARTIAL' },
              ]}
            />
          </Col>

          {/* Clear Filters Button */}
          <Col xs={12} sm={6} md={4} lg={4}>
            <Button
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
                setCityFilter('ALL');
                setPaymentFilter('ALL');
              }}
            >
              Reset Filters
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Main B2B Table View */}
      <Card size="small" bodyStyle={{ padding: 0 }} style={{ borderRadius: 8, overflow: 'hidden' }}>
        <Table
          dataSource={filteredOrders}
          columns={columns}
          rowKey="id"
          scroll={{ x: 1600 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} B2B Wholesale Purchase Orders`,
          }}
          onRow={(record) => ({
            onClick: () => setDrawerOrderId(record.id),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      {/* Order Detail Drawer */}
      <OrderDetailDrawer orderId={drawerOrderId} onClose={() => setDrawerOrderId(null)} />

      {/* Order Creation Modal */}
      <OrderFormModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    </Space>
  );
}
