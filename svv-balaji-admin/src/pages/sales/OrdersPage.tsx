import {
  AppstoreOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
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
import { apiErrorMessage } from '../../api/client';
import type {
  Order,
  OrderQuery,
  OrderStatus,
  PaymentStatus,
  SalesChannel,
} from '../../api/types';
import { ORDER_STATUSES, PAYMENT_STATUSES, SALES_CHANNELS } from '../../api/types';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { CustomerSelect, WarehouseSelect } from '../../components/pickers';
import { useOrders } from '@shared/hooks/useSales';
import { EM_DASH, formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import { PAYMENT_STATUS_COLOUR, PAYMENT_STATUS_LABEL } from '@shared/utils/paymentStatus';
import { OrderDetailDrawer } from './OrderDetailDrawer';
import { OrderFormModal } from './OrderFormModal';
import { ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from './orderStatus';
import { downloadOrderBill } from '../../utils/invoiceGenerator';

const { Text, Title } = Typography;

export interface ExtendedOrder extends Order {
  customerMobile?: string;
  deliveryCity?: string;
  itemsSummary?: string;
  primaryProductName?: string;
  totalItemCount?: number;
  assignedNodeName?: string;
  logisticsPartner?: string;
  awbNumber?: string;
  paymentMethod?: string;
  orderSource?: string;
}

export const MOCK_ORDERS: ExtendedOrder[] = [
  {
    id: 'ord-pos-1',
    orderNumber: 'POS-PAT-90101',
    channel: 'B2C',
    customerId: 'cust-pos-01',
    customer: { id: 'cust-pos-01', customerCode: 'POS-WALKIN', name: 'Walk-In Counter Customer', channel: 'B2C' },
    status: 'DELIVERED',
    orderDate: '2026-09-17T14:20:00.000Z',
    requiredByDate: '2026-09-17T14:20:00.000Z',
    dispatchedAt: '2026-09-17T14:20:00.000Z',
    deliveredAt: '2026-09-17T14:20:00.000Z',
    warehouseId: 'outlet-pat-01',
    warehouse: { id: 'outlet-pat-01', name: 'Patna City Flagship Store' },
    branchId: 'br-1',
    subtotal: '2100.00',
    taxTotal: '150.00',
    total: '2250.00',
    paymentStatus: 'PAID',
    paymentTerms: 'PREPAID',
    deliveryAddress: 'Over-the-Counter Cashier Bill #04',
    notes: 'POS Counter Cashier: Pankaj Kumar. Receipt printed & handed to customer.',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-17T14:20:00.000Z',
    updatedAt: '2026-09-17T14:20:00.000Z',
    customerMobile: '+91 98350 00000',
    deliveryCity: 'Patna Outlet',
    primaryProductName: 'A2 Pure Desi Cow Ghee (1L Jar) + Sharbati Atta (10kg)',
    totalItemCount: 2,
    itemsSummary: '2 items (11 kg)',
    assignedNodeName: 'Patna City Flagship Store',
    logisticsPartner: 'Over-the-Counter Instant Carry',
    awbNumber: 'POS-BILL-90101',
    paymentMethod: 'PhonePe QR / UPI Scan',
    orderSource: 'POS_COUNTER',
  },
  {
    id: 'ord-pos-2',
    orderNumber: 'POS-IND-80412',
    channel: 'B2C',
    customerId: 'cust-pos-02',
    customer: { id: 'cust-pos-02', customerCode: 'POS-WALKIN', name: 'SURESH VERMA (Walk-In)', channel: 'B2C' },
    status: 'DELIVERED',
    orderDate: '2026-09-17T11:45:00.000Z',
    requiredByDate: '2026-09-17T11:45:00.000Z',
    dispatchedAt: '2026-09-17T11:45:00.000Z',
    deliveredAt: '2026-09-17T11:45:00.000Z',
    warehouseId: 'outlet-ind-02',
    warehouse: { id: 'outlet-ind-02', name: 'Indore Depot Outlet' },
    branchId: 'br-2',
    subtotal: '1500.00',
    taxTotal: '100.00',
    total: '1600.00',
    paymentStatus: 'PAID',
    paymentTerms: 'PREPAID',
    deliveryAddress: 'Over-the-Counter Cashier Bill #02',
    notes: 'POS Cash Drawer payment collected.',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-17T11:45:00.000Z',
    updatedAt: '2026-09-17T11:45:00.000Z',
    customerMobile: '+91 99260 00000',
    deliveryCity: 'Indore Outlet',
    primaryProductName: 'Cold-Pressed Kachi Ghani Mustard Oil (5 L Tin)',
    totalItemCount: 1,
    itemsSummary: '1 item (5 L)',
    assignedNodeName: 'Indore Depot Outlet',
    logisticsPartner: 'Over-the-Counter Instant Carry',
    awbNumber: 'POS-BILL-80412',
    paymentMethod: 'Cash (Cashier Drawer)',
    orderSource: 'POS_COUNTER',
  },
  {
    id: 'ord-mock-1',
    orderNumber: 'DT-ORD-94021',
    channel: 'B2C',
    customerId: 'cust-101',
    customer: { id: 'cust-101', customerCode: 'CUST-B2C-000001', name: 'Rohit Sharma', channel: 'B2C' },
    status: 'DELIVERED',
    orderDate: '2026-09-16T11:30:00.000Z',
    requiredByDate: '2026-09-17T18:00:00.000Z',
    dispatchedAt: '2026-09-16T17:30:00.000Z',
    deliveredAt: '2026-09-17T13:10:00.000Z',
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Patna Central Processing Hub' },
    branchId: 'br-1',
    subtotal: '1250.00',
    taxTotal: '150.00',
    total: '1450.00',
    paymentStatus: 'PAID',
    paymentTerms: 'PREPAID',
    deliveryAddress: 'Flat 402, Royal Residency, Boring Road, Patna, Bihar - 800001',
    notes: 'Please leave at security desk if recipient unavailable.',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-16T11:30:00.000Z',
    updatedAt: '2026-09-17T13:10:00.000Z',
    customerMobile: '+91 98765 43210',
    deliveryCity: 'Patna',
    primaryProductName: 'Organic Sharbati Wheat Atta (10 KG)',
    totalItemCount: 3,
    itemsSummary: '3 items (7 kg)',
    assignedNodeName: 'Patna City Dark Store (Outlet)',
    logisticsPartner: 'In-House Delivery Fleet (Vikram Singh)',
    awbNumber: 'AWB-889210',
    paymentMethod: 'Razorpay / UPI (pay_Px982103912)',
    orderSource: 'Android App',
  },
  {
    id: 'ord-mock-2',
    orderNumber: 'DT-ORD-94022',
    channel: 'B2C',
    customerId: 'cust-102',
    customer: { id: 'cust-102', customerCode: 'CUST-B2C-000002', name: 'Ananya Roy', channel: 'B2C' },
    status: 'DISPATCHED',
    orderDate: '2026-09-17T09:15:00.000Z',
    requiredByDate: '2026-09-18T18:00:00.000Z',
    dispatchedAt: '2026-09-17T12:00:00.000Z',
    deliveredAt: null,
    warehouseId: 'wh-2',
    warehouse: { id: 'wh-2', name: 'Ranchi Express Outlet' },
    branchId: 'br-2',
    subtotal: '790.00',
    taxTotal: '100.00',
    total: '890.00',
    paymentStatus: 'PENDING',
    paymentTerms: 'PREPAID',
    deliveryAddress: 'House 44/B, Kanke Road, Ranchi, Jharkhand - 834008',
    notes: 'Call customer before delivery',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-17T09:15:00.000Z',
    updatedAt: '2026-09-17T12:00:00.000Z',
    customerMobile: '+91 91119 66732',
    deliveryCity: 'Ranchi',
    primaryProductName: 'Royal 1121 Premium Basmati Rice (5 KG)',
    totalItemCount: 2,
    itemsSummary: '2 items (5 kg)',
    assignedNodeName: 'Ranchi Express Dark Store',
    logisticsPartner: 'Delhivery 3PL Courier',
    awbNumber: 'AWB-889211',
    paymentMethod: 'Cash on Delivery (COD)',
    orderSource: 'iOS App',
  },
  {
    id: 'ord-mock-3',
    orderNumber: 'DT-ORD-94023',
    channel: 'B2C',
    customerId: 'cust-103',
    customer: { id: 'cust-103', customerCode: 'CUST-B2C-000003', name: 'Suresh Kumar', channel: 'B2C' },
    status: 'PACKED',
    orderDate: '2026-09-17T08:00:00.000Z',
    requiredByDate: '2026-09-19T18:00:00.000Z',
    dispatchedAt: null,
    deliveredAt: null,
    warehouseId: 'wh-3',
    warehouse: { id: 'wh-3', name: 'Gaya Regional Warehouse' },
    branchId: 'br-3',
    subtotal: '1650.00',
    taxTotal: '200.00',
    total: '1850.00',
    paymentStatus: 'PAID',
    paymentTerms: 'PREPAID',
    deliveryAddress: 'House 12, Main Market Road, Gaya, Bihar - 823001',
    notes: 'Fragile handling for glass ghee jar',
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-17T08:00:00.000Z',
    updatedAt: '2026-09-17T10:30:00.000Z',
    customerMobile: '+91 94310 88200',
    deliveryCity: 'Gaya',
    primaryProductName: 'A2 Pure Desi Cow Ghee (1L Glass Jar)',
    totalItemCount: 1,
    itemsSummary: '1 item (1 kg)',
    assignedNodeName: 'Gaya Dark Store Outlet',
    logisticsPartner: 'In-House Express Fleet',
    awbNumber: 'AWB-889214',
    paymentMethod: 'UPI / PhonePe',
    orderSource: 'Web Storefront',
  },
  {
    id: 'ord-mock-4',
    orderNumber: 'DT-ORD-94024',
    channel: 'B2C',
    customerId: 'cust-104',
    customer: { id: 'cust-104', customerCode: 'CUST-B2C-000004', name: 'Priya Verma', channel: 'B2C' },
    status: 'CONFIRMED',
    orderDate: '2026-09-17T11:45:00.000Z',
    requiredByDate: '2026-09-18T18:00:00.000Z',
    dispatchedAt: null,
    deliveredAt: null,
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Muzaffarpur Processing Center' },
    branchId: 'br-1',
    subtotal: '1850.00',
    taxTotal: '250.00',
    total: '2100.00',
    paymentStatus: 'PAID',
    paymentTerms: 'PREPAID',
    deliveryAddress: 'Sector 3, Club Road, Muzaffarpur, Bihar - 842001',
    notes: null,
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-17T11:45:00.000Z',
    updatedAt: '2026-09-17T11:50:00.000Z',
    customerMobile: '+91 98350 44219',
    deliveryCity: 'Muzaffarpur',
    primaryProductName: 'Organic Phool Makhana Jumbo (250g)',
    totalItemCount: 4,
    itemsSummary: '4 items (10 kg)',
    assignedNodeName: 'Muzaffarpur Outlet',
    logisticsPartner: 'In-House Express Rider',
    awbNumber: 'AWB-889212',
    paymentMethod: 'Paytm UPI',
    orderSource: 'Android App',
  },
  {
    id: 'ord-mock-5',
    orderNumber: 'DT-ORD-94025',
    channel: 'B2C',
    customerId: 'cust-105',
    customer: { id: 'cust-105', customerCode: 'CUST-B2C-000005', name: 'Amitabh Sen', channel: 'B2C' },
    status: 'PLACED',
    orderDate: '2026-09-17T13:20:00.000Z',
    requiredByDate: '2026-09-19T18:00:00.000Z',
    dispatchedAt: null,
    deliveredAt: null,
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Central Processing Warehouse' },
    branchId: 'br-1',
    subtotal: '400.00',
    taxTotal: '50.00',
    total: '450.00',
    paymentStatus: 'PAID',
    paymentTerms: 'PREPAID',
    deliveryAddress: 'Housing Colony, Dhanbad, Jharkhand - 826001',
    notes: null,
    cancelledReason: null,
    cancelledAt: null,
    createdAt: '2026-09-17T13:20:00.000Z',
    updatedAt: '2026-09-17T13:20:00.000Z',
    customerMobile: '+91 97714 55012',
    deliveryCity: 'Dhanbad',
    primaryProductName: 'Kashmiri Red Chilli Powder (250g)',
    totalItemCount: 1,
    itemsSummary: '1 item (2 kg)',
    assignedNodeName: 'Central Fulfillment Warehouse',
    logisticsPartner: 'BlueDart Express',
    awbNumber: 'AWB-889213',
    paymentMethod: 'Razorpay Credit Card',
    orderSource: 'iOS App',
  },
  {
    id: 'ord-mock-6',
    orderNumber: 'DT-ORD-94026',
    channel: 'B2C',
    customerId: 'cust-106',
    customer: { id: 'cust-106', customerCode: 'CUST-B2C-000006', name: 'Sunil Gupta', channel: 'B2C' },
    status: 'CANCELLED',
    orderDate: '2026-09-15T10:00:00.000Z',
    requiredByDate: '2026-09-16T18:00:00.000Z',
    dispatchedAt: null,
    deliveredAt: null,
    warehouseId: 'wh-1',
    warehouse: { id: 'wh-1', name: 'Patna Central Warehouse' },
    branchId: 'br-1',
    subtotal: '650.00',
    taxTotal: '70.00',
    total: '720.00',
    paymentStatus: 'REFUNDED',
    paymentTerms: 'PREPAID',
    deliveryAddress: 'Exhibition Road, Patna, Bihar - 800001',
    notes: 'Cancelled by shopper prior to dispatch.',
    cancelledReason: 'Customer requested cancellation before batch allocation.',
    cancelledAt: '2026-09-15T11:30:00.000Z',
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-09-15T11:30:00.000Z',
    customerMobile: '+91 99341 00192',
    deliveryCity: 'Patna',
    primaryProductName: 'Unpolished Desi Chana Dal (1 KG)',
    totalItemCount: 2,
    itemsSummary: '2 items (4 kg)',
    assignedNodeName: 'Patna Central Warehouse',
    logisticsPartner: 'N/A (Order Cancelled)',
    awbNumber: 'N/A',
    paymentMethod: 'Refunded (Razorpay Txn 99218)',
    orderSource: 'Android App',
  },
];

/**
 * Super Admin Order Management Center (B2C & B2B)
 */
export function OrdersPage() {
  const { message } = AntApp.useApp();
  const [query, setQuery] = useState<OrderQuery>({});
  const [formOpen, setFormOpen] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatus | undefined>(undefined);
  const [paymentModeFilter, setPaymentModeFilter] = useState<'all' | 'ONLINE' | 'COD'>('all');
  const [selectedWarehouseNode, setSelectedWarehouseNode] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<string>('all');

  const ordersQuery = useOrders(query);

  const rawOrders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);
  const combined = useMemo(() => [...rawOrders, ...MOCK_ORDERS], [rawOrders]);

  const enrichedOrders: ExtendedOrder[] = useMemo(() => {
    return combined.map((o) => {
      const ext = o as ExtendedOrder;
      return {
        ...ext,
        customerMobile: ext.customerMobile || '+91 98765 43210',
        deliveryCity: ext.deliveryCity || 'Patna',
        itemsSummary: ext.itemsSummary || '3 items (7 kg)',
        assignedNodeName: ext.assignedNodeName || ext.warehouse?.name || 'Patna Outlet Store',
        logisticsPartner: ext.logisticsPartner || 'In-House Fleet',
        awbNumber: ext.awbNumber || 'AWB-889210',
        paymentMethod: ext.paymentMethod || 'Razorpay / UPI',
        orderSource: ext.orderSource || 'Android App',
      };
    });
  }, [combined]);

  // Filtered rows
  const filteredOrders = useMemo(() => {
    return enrichedOrders.filter((o) => {
      // Search query (Order ID, Customer Name, Phone, AWB)
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesNum = o.orderNumber.toLowerCase().includes(q);
        const matchesCust = (o.customer?.name ?? '').toLowerCase().includes(q);
        const matchesPhone = (o.customerMobile ?? '').includes(q);
        const matchesAwb = (o.awbNumber ?? '').toLowerCase().includes(q);
        if (!matchesNum && !matchesCust && !matchesPhone && !matchesAwb) return false;
      }

      // Tab filter
      if (activeTab === 'pos' && o.orderSource !== 'POS_COUNTER') return false;
      if (activeTab === 'pending' && !['PLACED', 'CONFIRMED'].includes(o.status)) return false;
      if (activeTab === 'packed' && o.status !== 'PACKED') return false;
      if (activeTab === 'dispatched' && o.status !== 'DISPATCHED') return false;
      if (activeTab === 'delivered' && o.status !== 'DELIVERED') return false;
      if (activeTab === 'cancelled' && o.status !== 'CANCELLED') return false;

      // Payment Status filter
      if (paymentStatusFilter && o.paymentStatus !== paymentStatusFilter) return false;

      // Payment Mode filter
      if (paymentModeFilter === 'ONLINE' && o.paymentStatus !== 'PAID') return false;
      if (paymentModeFilter === 'COD' && o.paymentStatus === 'PAID') return false;

      // Warehouse Node filter
      if (selectedWarehouseNode && o.warehouseId !== selectedWarehouseNode) return false;

      return true;
    });
  }, [enrichedOrders, searchQuery, activeTab, paymentStatusFilter, paymentModeFilter, selectedWarehouseNode]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = enrichedOrders.length;
    const pendingCount = enrichedOrders.filter((o) => ['PLACED', 'CONFIRMED'].includes(o.status)).length;
    const inTransitCount = enrichedOrders.filter((o) => o.status === 'DISPATCHED').length;
    const deliveredCount = enrichedOrders.filter((o) => o.status === 'DELIVERED').length;
    const totalRevenue = enrichedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

    return { total, pendingCount, inTransitCount, deliveredCount, totalRevenue };
  }, [enrichedOrders]);

  const patchQuery = (patch: Partial<OrderQuery>) => setQuery((prev) => ({ ...prev, ...patch }));

  const columns: ColumnsType<ExtendedOrder> = [
    {
      title: 'Order ID & Date',
      key: 'orderNumber',
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Tag color="purple" style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>
            #{record.orderNumber}
          </Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {formatDateTime(record.orderDate)}
          </Text>
        </Space>
      ),
      sorter: (a, b) => a.orderNumber.localeCompare(b.orderNumber),
    },
    {
      title: 'Customer Name',
      key: 'customerName',
      width: 150,
      render: (_, record) => (
        <Text strong style={{ fontSize: 13 }} ellipsis={{ tooltip: true }}>
          {record.customer?.name ?? 'Guest Shopper'}
        </Text>
      ),
    },
    {
      title: 'Mobile Number',
      key: 'customerMobile',
      width: 140,
      render: (_, record) => (
        <Text style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#595959' }}>
          {record.customerMobile || '+91 98765 43210'}
        </Text>
      ),
    },
    {
      title: 'Delivery City',
      key: 'deliveryCity',
      width: 110,
      render: (_, record) => (
        <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
          {record.deliveryCity || 'Patna'}
        </Tag>
      ),
    },
    {
      title: 'Order Items',
      key: 'orderedItems',
      width: 210,
      render: (_, record) => {
        const firstItem = record.primaryProductName || 'Organic Sharbati Wheat Atta (10 KG)';
        const count = record.totalItemCount || 3;
        const extraCount = count - 1;
        return (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 12, color: '#262626' }} ellipsis={{ tooltip: firstItem }}>
              {firstItem}
            </Text>
            {extraCount > 0 ? (
              <Tag color="cyan" style={{ fontSize: 10, margin: '2px 0 0 0', width: 'fit-content' }}>
                +{extraCount} more {extraCount === 1 ? 'item' : 'items'}
              </Tag>
            ) : (
              <Text type="secondary" style={{ fontSize: 10 }}>
                1 item single pack
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Total Amount',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 120,
      render: (val: string) => (
        <Text strong style={{ color: '#1677ff', fontSize: 13 }}>
          {formatCurrency(val)}
        </Text>
      ),
      sorter: (a, b) => Number(a.total) - Number(b.total),
    },
    {
      title: 'Payment Status',
      key: 'paymentStatus',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Tag color={PAYMENT_STATUS_COLOUR[record.paymentStatus]} style={{ fontSize: 10, margin: 0 }}>
            {PAYMENT_STATUS_LABEL[record.paymentStatus]}
          </Tag>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {record.paymentMethod || (record.paymentStatus === 'PAID' ? 'Razorpay / UPI' : 'COD')}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Fulfillment Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: OrderStatus) => (
        <Tag color={ORDER_STATUS_COLOUR[status]} style={{ fontSize: 10, margin: 0 }}>
          {ORDER_STATUS_LABEL[status]}
        </Tag>
      ),
    },
    {
      title: 'Assigned Node',
      key: 'assignedNode',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <HomeOutlined style={{ color: '#1677ff', fontSize: 12 }} />
          <Text style={{ fontSize: 11 }} ellipsis={{ tooltip: true }}>
            {record.assignedNodeName || record.warehouse?.name || 'Patna City Dark Store'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Logistics Partner',
      key: 'logistics',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            <TruckOutlined style={{ color: '#52c41a', fontSize: 12 }} />
            <Text style={{ fontSize: 11 }}>{record.logisticsPartner || 'In-House Fleet'}</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {record.awbNumber || 'AWB-889210'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="View Order Details & Audit Trail">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setOpenOrderId(record.id);
              }}
              style={{ fontSize: 11 }}
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
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {/* Page Header */}
      <PageHeader
        title="Customer Order Management (OMS)"
        subtitle="Super Admin Order Fulfillment: Real-time tracking across B2C storefront orders, node allocations, logistics partners, and batch trace provenance."
        actions={
          <Can do="ORDER_CREATE">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              New Manual Order
            </Button>
          </Can>
        }
      />

      {/* Summary Metrics */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total B2C Orders"
              value={metrics.total}
              prefix={<ShoppingOutlined style={{ color: '#1677ff', fontSize: 16 }} />}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Pending Allocation / Packing"
              value={metrics.pendingCount}
              prefix={<CalendarOutlined style={{ color: '#fa8c16', fontSize: 16 }} />}
              valueStyle={{ color: '#fa8c16', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="In Transit / Dispatched"
              value={metrics.inTransitCount}
              prefix={<TruckOutlined style={{ color: '#13c2c2', fontSize: 16 }} />}
              valueStyle={{ color: '#13c2c2', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Gross Order Revenue"
              value={formatCurrency(metrics.totalRevenue)}
              prefix="₹"
              valueStyle={{ color: '#389e0d', fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 8 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* Global Filter Bar */}
          <Row gutter={[12, 12]} align="middle" justify="space-between">
            <Col xs={24} md={12}>
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                size="small"
                style={{ marginBottom: 0 }}
                items={[
                  { key: 'all', label: `All Orders (${metrics.total})` },
                  { key: 'pos', label: `🏪 POS Counter Bills (${enrichedOrders.filter((o) => o.orderSource === 'POS_COUNTER').length})` },
                  { key: 'pending', label: `Pending Allocation (${metrics.pendingCount})` },
                  { key: 'packed', label: 'Packed' },
                  { key: 'dispatched', label: `In Transit (${metrics.inTransitCount})` },
                  { key: 'delivered', label: `Delivered (${metrics.deliveredCount})` },
                ]}
              />
            </Col>

            <Col xs={24} md={12}>
              <Space style={{ width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Input.Search
                  allowClear
                  size="small"
                  placeholder="Order ID, Customer, Phone, AWB..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: 210 }}
                />

                <WarehouseSelect
                  allowClear
                  placeholder="Fulfillment Route Node"
                  value={selectedWarehouseNode}
                  onChange={(node) => setSelectedWarehouseNode(node)}
                  style={{ width: 140 }}
                />

                <Select
                  size="small"
                  value={paymentModeFilter}
                  onChange={(val) => setPaymentModeFilter(val)}
                  options={[
                    { value: 'all', label: 'All Payment Modes' },
                    { value: 'ONLINE', label: 'Prepaid (Razorpay / UPI)' },
                    { value: 'COD', label: 'Cash on Delivery (COD)' },
                  ]}
                  style={{ width: 145 }}
                />
              </Space>
            </Col>
          </Row>

          <Table<ExtendedOrder>
            columns={columns}
            dataSource={filteredOrders}
            rowKey="id"
            loading={ordersQuery.isLoading}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            size="small"
            scroll={{ x: 1250 }}
            onRow={(record) => ({
              onClick: () => setOpenOrderId(record.id),
              style: { cursor: 'pointer' },
            })}
          />
        </Space>
      </Card>

      {/* Form & Granular Order Detail Drawer */}
      <OrderFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <OrderDetailDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </Space>
  );
}
