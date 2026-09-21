import { paymentLabel } from './OrderDetailParts';
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
  // Rows are the API's orders, enriched ONLY from what each order carries - no invented
  // phone numbers, cities, items or payment methods.
  const enrichedOrders: ExtendedOrder[] = useMemo(() => {
    return rawOrders.map((o) => {
      const ext = o as ExtendedOrder & Record<string, any>;
      const items: any[] = ext.items ?? [];
      const first = items[0];
      const snap = ext.addressSnapshot as { city?: string } | null | undefined;
      return {
        ...ext,
        customerMobile: ext.customer?.phone ?? undefined,
        deliveryCity: snap?.city ?? undefined,
        primaryProductName: first?.nameSnapshot ?? first?.product?.name ?? undefined,
        totalItemCount: items.length,
        itemsSummary: items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : undefined,
        assignedNodeName: ext.warehouse?.name,
        logisticsPartner: ext.shipment?.courier ?? ext.riderName ?? undefined,
        awbNumber: ext.shipment?.awb ?? undefined,
        paymentMethod: paymentLabel(ext),
        orderSource: ext.source === 'STOREFRONT' ? 'Customer app' : 'Staff',
      };
    });
  }, [rawOrders]);

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
      const mode = (o as any).paymentMode as string | null | undefined;
      if (paymentModeFilter === 'ONLINE' && (mode ? mode !== 'ONLINE' : o.paymentStatus !== 'PAID')) return false;
      if (paymentModeFilter === 'COD' && (mode ? mode !== 'COD' : o.paymentStatus === 'PAID')) return false;

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
        <div style={{ maxWidth: 140 }}>
          <Text strong style={{ fontSize: 13, display: 'block' }} ellipsis={{ tooltip: record.customer?.name ?? 'Guest Shopper' }}>
            {record.customer?.name ?? 'Guest Shopper'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Mobile Number',
      key: 'customerMobile',
      width: 130,
      render: (_, record) => (
        <Text style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#595959' }}>
          {record.customerMobile ?? '—'}
        </Text>
      ),
    },
    {
      title: 'Delivery City',
      key: 'deliveryCity',
      width: 110,
      render: (_, record) => (
        <Tag color="blue" style={{ fontSize: 11, margin: 0, whiteSpace: 'nowrap' }}>
          {record.deliveryCity ?? '—'}
        </Tag>
      ),
    },
    {
      title: 'Order Items',
      key: 'orderedItems',
      width: 220,
      render: (_, record) => {
        const firstItem = record.primaryProductName ?? '—';
        const count = record.totalItemCount ?? 0;
        const extraCount = count - 1;
        return (
          <div style={{ maxWidth: 210 }}>
            <Text strong style={{ fontSize: 12, color: '#262626', display: 'block' }} ellipsis={{ tooltip: firstItem }}>
              {firstItem}
            </Text>
            {extraCount > 0 ? (
              <Tag color="cyan" style={{ fontSize: 10, margin: '2px 0 0 0', width: 'fit-content' }}>
                +{extraCount} more {extraCount === 1 ? 'item' : 'items'}
              </Tag>
            ) : (
              <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                1 item single pack
              </Text>
            )}
          </div>
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
        <Text strong style={{ color: '#1677ff', fontSize: 13, whiteSpace: 'nowrap' }}>
          {formatCurrency(val)}
        </Text>
      ),
      sorter: (a, b) => Number(a.total) - Number(b.total),
    },
    {
      title: 'Payment Status',
      key: 'paymentStatus',
      width: 130,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Tag color={PAYMENT_STATUS_COLOUR[record.paymentStatus]} style={{ fontSize: 10, margin: 0, whiteSpace: 'nowrap' }}>
            {PAYMENT_STATUS_LABEL[record.paymentStatus]}
          </Tag>
          <Text type="secondary" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
            {record.paymentMethod ?? '—'}
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
        <Tag color={ORDER_STATUS_COLOUR[status]} style={{ fontSize: 10, margin: 0, whiteSpace: 'nowrap' }}>
          {ORDER_STATUS_LABEL[status]}
        </Tag>
      ),
    },
    {
      title: 'Assigned Node',
      key: 'assignedNode',
      width: 175,
      render: (_, record) => (
        <div style={{ maxWidth: 170 }}>
          <Space size={4} style={{ maxWidth: '100%' }}>
            <HomeOutlined style={{ color: '#1677ff', fontSize: 12, flexShrink: 0 }} />
            <Text style={{ fontSize: 11, maxWidth: 140, display: 'block' }} ellipsis={{ tooltip: record.assignedNodeName || record.warehouse?.name || '—' }}>
              {record.assignedNodeName || record.warehouse?.name || '—'}
            </Text>
          </Space>
          {record.fulfillmentMethod ? (
            <div style={{ marginTop: 2 }}>
              <Tag
                color={record.fulfillmentMethod === 'LOCAL' ? 'green' : 'blue'}
                style={{ fontSize: 10, margin: 0, padding: '0 6px', borderRadius: 4, lineHeight: '18px', whiteSpace: 'nowrap' }}
              >
                {record.fulfillmentMethod === 'LOCAL' ? '⚡ Local Delivery' : '📦 Shiprocket'}
              </Tag>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Logistics Partner',
      key: 'logistics',
      width: 175,
      render: (_, record) => (
        <div style={{ maxWidth: 170 }}>
          <Space size={4} style={{ maxWidth: '100%' }}>
            <TruckOutlined style={{ color: '#52c41a', fontSize: 12, flexShrink: 0 }} />
            <Text style={{ fontSize: 11, fontWeight: 500, maxWidth: 145, display: 'block' }} ellipsis={{ tooltip: true }}>
              {record.shipment?.courier ?? record.riderName ?? record.logisticsPartner ?? (record.source === 'STOREFRONT' ? 'Not assigned yet' : '—')}
            </Text>
          </Space>
          {record.shipment?.awb || record.awbNumber ? (
            <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace', display: 'block', marginTop: 2, whiteSpace: 'nowrap' }}>
              AWB: {record.shipment?.awb ?? record.awbNumber}
            </Text>
          ) : null}
        </div>
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
                    { value: 'ONLINE', label: 'Prepaid (online)' },
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
