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
import { OrderDetailDrawer } from './OrderDetailDrawer';
import { OrderFormModal } from './OrderFormModal';
import { ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from './orderStatus';
import { downloadOrderBill } from '../../utils/invoiceGenerator';

const { Text, Title } = Typography;

export interface B2BOrder extends Order {
  companyName: string;
  gstin: string;
  poNumber: string;
  contactPersonName: string;
  contactPersonMobile: string;
  deliveryCity: string;
  creditTerms: string;
  primaryProductName: string;
  bulkQuantitySummary: string;
  totalWeightKg: number;
  assignedNodeName: string;
  freightPartner: string;
  truckNumber: string;
  paymentMethod: string;
}

export const MOCK_B2B_ORDERS: B2BOrder[] = [
  {
    id: 'b2b-ord-101',
    orderNumber: 'B2B-PO-88101',
    channel: 'B2B',
    customerId: 'cust-b2b-01',
    customer: { id: 'cust-b2b-01', customerCode: 'B2B-COMP-001', name: 'Patna Mega Mart Pvt Ltd', channel: 'B2B' },
    companyName: 'Patna Mega Mart Pvt Ltd',
    gstin: '10AAACS9981P1Z5',
    poNumber: 'PO-202609-8812',
    contactPersonName: 'Anand Kumar (Procurement Manager)',
    contactPersonMobile: '+91 98350 11029',
    status: 'DELIVERED',
    orderDate: '2026-09-15T10:00:00.000Z',
    requiredByDate: '2026-09-17T18:00:00.000Z',
    dispatchedAt: '2026-09-16T08:30:00.000Z',
    deliveredAt: '2026-09-17T11:45:00.000Z',
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Patna Regional Grain Silo & Depot (WH-01)' },
    branchId: 'br-1',
    subtotal: '450000.00',
    taxTotal: '22500.00',
    total: '472500.00',
    paymentStatus: 'PAID',
    paymentTerms: 'CREDIT_30',
    creditTerms: 'Net 30 Days (Credit Limit: ₹15.0 Lakhs)',
    deliveryAddress: 'Central Warehouse #4, Industrial Area, Fatuha, Patna, Bihar - 803201',
    notes: 'Gate entry allowed between 8 AM to 6 PM. Unloading ramp #2 reserved.',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-17T11:45:00.000Z',
    deliveryCity: 'Patna',
    primaryProductName: 'Desi Tokri Organic Sharbati Wheat Atta (10 KG Bulk)',
    bulkQuantitySummary: '400 Master Bags (4,000 KG)',
    totalWeightKg: 4000,
    assignedNodeName: 'Patna Regional Grain Silo (WH-01)',
    freightPartner: 'VRL Logistics 14-Wheeler Heavy Freight',
    truckNumber: 'BR-01-GC-8812',
    paymentMethod: 'Bank Wire / RTGS (UTR: HDFCR52026091500912)',
  },
  {
    id: 'b2b-ord-102',
    orderNumber: 'B2B-PO-88102',
    channel: 'B2B',
    customerId: 'cust-b2b-02',
    customer: { id: 'cust-b2b-02', customerCode: 'B2B-COMP-002', name: 'Bihar State Agro Co-Operative Federation', channel: 'B2B' },
    companyName: 'Bihar State Agro Co-Op Federation',
    gstin: '10BBBDS8810R1Z2',
    poNumber: 'PO-GOVT-202609-04',
    contactPersonName: 'Suresh Chandra (State Supply Officer)',
    contactPersonMobile: '+91 94310 88201',
    status: 'DISPATCHED',
    orderDate: '2026-09-16T14:20:00.000Z',
    requiredByDate: '2026-09-19T18:00:00.000Z',
    dispatchedAt: '2026-09-17T09:00:00.000Z',
    deliveredAt: null,
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Patna Central Processing Hub' },
    branchId: 'br-1',
    subtotal: '890000.00',
    taxTotal: '44500.00',
    total: '934500.00',
    paymentStatus: 'PAID',
    paymentTerms: 'PREPAID',
    creditTerms: '50% Advance Received / 50% On Delivery',
    deliveryAddress: 'State Depot Shed #12, Zero Mile, Muzaffarpur, Bihar - 842001',
    notes: 'Government Tender Order #TND-2026-881. Quality Certificate compulsory.',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-16T14:20:00.000Z',
    updatedAt: '2026-09-17T09:00:00.000Z',
    deliveryCity: 'Muzaffarpur',
    primaryProductName: 'Royal 1121 Basmati Rice (25 KG Bulk Bag)',
    bulkQuantitySummary: '600 Bags (15,000 KG)',
    totalWeightKg: 15000,
    assignedNodeName: 'Patna Central Processing Hub',
    freightPartner: 'In-House Heavy Bulk Freight Fleet',
    truckNumber: 'BR-06-GA-9921',
    paymentMethod: 'SBI Treasury e-Transfer (Ref: TREAS-881092)',
  },
  {
    id: 'b2b-ord-103',
    orderNumber: 'B2B-PO-88103',
    channel: 'B2B',
    customerId: 'cust-b2b-03',
    customer: { id: 'cust-b2b-03', customerCode: 'B2B-COMP-003', name: 'Magadh Hypermarket & Retail Chain', channel: 'B2B' },
    companyName: 'Magadh Hypermarket & Retail Chain',
    gstin: '10CCCDS7720Q1Z9',
    poNumber: 'PO-MAGADH-9012',
    contactPersonName: 'Vikramaditya Roy (Category Lead)',
    contactPersonMobile: '+91 97714 55102',
    status: 'ALLOCATED',
    orderDate: '2026-09-17T08:30:00.000Z',
    requiredByDate: '2026-09-20T18:00:00.000Z',
    dispatchedAt: null,
    deliveredAt: null,
    warehouseId: 'wh-2',
    warehouse: { id: 'wh-2', name: 'Gaya Regional Distribution Center' },
    branchId: 'br-2',
    subtotal: '280000.00',
    taxTotal: '33600.00',
    total: '313600.00',
    paymentStatus: 'PENDING',
    paymentTerms: 'CREDIT_15',
    creditTerms: 'Net 15 Days (Credit Limit: ₹5.0 Lakhs)',
    deliveryAddress: 'Magadh Logistics Park, GT Road, Gaya, Bihar - 823001',
    notes: 'FEFO Allocation strictly enforced. Minimum 9 months shelf life required.',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-17T08:30:00.000Z',
    updatedAt: '2026-09-17T10:15:00.000Z',
    deliveryCity: 'Gaya',
    primaryProductName: 'A2 Pure Desi Cow Ghee (1 Litre Glass Jar - Case of 12)',
    bulkQuantitySummary: '100 Master Cases (1,200 Jars)',
    totalWeightKg: 1200,
    assignedNodeName: 'Gaya Regional Depot (WH-02)',
    freightPartner: 'Express Cold-Chain Logistics',
    truckNumber: 'BR-02-CD-4410',
    paymentMethod: 'Credit Terms (Invoice Due 02 Oct 2026)',
  },
  {
    id: 'b2b-ord-104',
    orderNumber: 'B2B-PO-88104',
    channel: 'B2B',
    customerId: 'cust-b2b-04',
    customer: { id: 'cust-b2b-04', customerCode: 'B2B-COMP-004', name: 'M/s Mithila Grain Distributors Co.', channel: 'B2B' },
    companyName: 'M/s Mithila Grain Distributors Co.',
    gstin: '10DDDEE6610P1Z8',
    poNumber: 'PO-MITH-88192',
    contactPersonName: 'Rameshwar Jha (Proprietor)',
    contactPersonMobile: '+91 94300 22190',
    status: 'PLACED',
    orderDate: '2026-09-17T11:00:00.000Z',
    requiredByDate: '2026-09-21T18:00:00.000Z',
    dispatchedAt: null,
    deliveredAt: null,
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Patna Central Processing Hub' },
    branchId: 'br-1',
    subtotal: '620000.00',
    taxTotal: '31000.00',
    total: '651000.00',
    paymentStatus: 'PARTIAL',
    paymentTerms: 'CREDIT_30',
    creditTerms: '30% Advance Paid / Balance Net 30',
    deliveryAddress: 'Wholesale Mandi Complex, Station Road, Darbhanga, Bihar - 846004',
    notes: 'Require moisture test certificate attached with dispatch slip.',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-17T11:00:00.000Z',
    updatedAt: '2026-09-17T11:00:00.000Z',
    deliveryCity: 'Darbhanga',
    primaryProductName: 'Organic Sona Masoori Raw Rice (25 KG Bulk Bag)',
    bulkQuantitySummary: '500 Bags (12,500 KG)',
    totalWeightKg: 12500,
    assignedNodeName: 'Patna Central Processing Hub',
    freightPartner: 'VRL Logistics Freight',
    truckNumber: 'BR-07-EF-1102',
    paymentMethod: 'NEFT Transfer (Ref: N0917202688192)',
  },
  {
    id: 'b2b-ord-105',
    orderNumber: 'B2B-PO-88105',
    channel: 'B2B',
    customerId: 'cust-b2b-05',
    customer: { id: 'cust-b2b-05', customerCode: 'B2B-COMP-005', name: 'Nalanda Organic Superstores', channel: 'B2B' },
    companyName: 'Nalanda Organic Superstores',
    gstin: '10EEEFF5510M1Z7',
    poNumber: 'PO-NAL-00412',
    contactPersonName: 'Priya Sharma (Operations Lead)',
    contactPersonMobile: '+91 91223 44012',
    status: 'PACKED',
    orderDate: '2026-09-16T16:45:00.000Z',
    requiredByDate: '2026-09-18T18:00:00.000Z',
    dispatchedAt: null,
    deliveredAt: null,
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Patna Central Processing Hub' },
    branchId: 'br-1',
    subtotal: '190000.00',
    taxTotal: '9500.00',
    total: '199500.00',
    paymentStatus: 'PAID',
    paymentTerms: 'PREPAID',
    creditTerms: 'Prepaid 100% Upfront Online',
    deliveryAddress: 'Main Market Road, Bihar Sharif, Nalanda, Bihar - 803101',
    notes: 'Palletized packaging with stretch film wrap required.',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-16T16:45:00.000Z',
    updatedAt: '2026-09-17T14:10:00.000Z',
    deliveryCity: 'Bihar Sharif',
    primaryProductName: 'Lakadong Organic Turmeric Powder (1 KG Pack Case)',
    bulkQuantitySummary: '50 Master Cartons (500 KG)',
    totalWeightKg: 500,
    assignedNodeName: 'Patna Central Processing Hub',
    freightPartner: 'In-House Express Cargo',
    truckNumber: 'BR-01-HD-3329',
    paymentMethod: 'UPI Merchant Payment (pay_B2B_991823)',
  },
];

export function B2BOrdersPage() {
  const { message } = AntApp.useApp();
  const [ordersList, setOrdersList] = useState<B2BOrder[]>(MOCK_B2B_ORDERS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    setOrdersList((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    message.success(`Fulfillment status updated to ${ORDER_STATUS_LABEL[newStatus]}`);
  };

  // Filter B2B Orders based on search and filters
  const filteredOrders = useMemo(() => {
    return ordersList.filter((order) => {
      const matchSearch =
        search === '' ||
        order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        order.companyName.toLowerCase().includes(search.toLowerCase()) ||
        order.gstin.toLowerCase().includes(search.toLowerCase()) ||
        order.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        order.contactPersonMobile.includes(search) ||
        order.contactPersonName.toLowerCase().includes(search.toLowerCase());

      const matchStatus = statusFilter === 'ALL' || order.status === statusFilter;
      const matchCity = cityFilter === 'ALL' || order.deliveryCity === cityFilter;
      const matchPayment = paymentFilter === 'ALL' || order.paymentStatus === paymentFilter;

      return matchSearch && matchStatus && matchCity && matchPayment;
    });
  }, [ordersList, search, statusFilter, cityFilter, paymentFilter]);

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
            Client PO: <Text strong style={{ fontSize: 11, color: '#722ed1' }}>{record.poNumber}</Text>
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
            {record.deliveryCity}
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
          <Text style={{ fontSize: 12, fontWeight: 600, color: '#1f1f1f' }}>{record.contactPersonName}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.contactPersonMobile}
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
            {record.primaryProductName}
          </Text>
          <Tag color="cyan" icon={<ContainerOutlined />} style={{ fontSize: 11, margin: 0, fontWeight: 600 }}>
            {record.bulkQuantitySummary}
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
        <div onClick={(e) => e.stopPropagation()}>
          <Select
            size="small"
            value={record.status}
            style={{ width: 135 }}
            onChange={(newStatus: OrderStatus) => handleStatusChange(record.id, newStatus)}
            options={[
              { label: 'PLACED', value: 'PLACED' },
              { label: 'CONFIRMED', value: 'CONFIRMED' },
              { label: 'ALLOCATED', value: 'ALLOCATED' },
              { label: 'PACKED', value: 'PACKED' },
              { label: 'DISPATCHED', value: 'DISPATCHED' },
              { label: 'DELIVERED', value: 'DELIVERED' },
              { label: 'CANCELLED', value: 'CANCELLED' },
            ]}
          />
        </div>
      ),
    },
    {
      title: 'Assigned Depot / Silo',
      key: 'warehouse',
      width: 210,
      render: (_, record) => (
        <Space size={4}>
          <HomeOutlined style={{ color: '#1677ff' }} />
          <Text style={{ fontSize: 11, fontWeight: 500 }}>{record.assignedNodeName}</Text>
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
            <Text style={{ fontSize: 11 }}>{record.freightPartner}</Text>
          </Space>
          <Tag color="geekblue" style={{ fontSize: 10, margin: 0 }}>
            Truck: {record.truckNumber}
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
                { label: 'Patna', value: 'Patna' },
                { label: 'Muzaffarpur', value: 'Muzaffarpur' },
                { label: 'Gaya', value: 'Gaya' },
                { label: 'Darbhanga', value: 'Darbhanga' },
                { label: 'Bihar Sharif', value: 'Bihar Sharif' },
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
