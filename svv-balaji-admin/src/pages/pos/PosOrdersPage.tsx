import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  DollarOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  FilterOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency } from '../../utils/format';
import { downloadPosBill } from '../../utils/invoiceGenerator';

const { Text, Title, Paragraph } = Typography;

export interface PosOrderRecord {
  id: string;
  orderId: string;
  createdAt: string;
  outletId: string;
  outletName: string;
  cashierName: string;
  customerName: string;
  customerMobile: string;
  customerGst?: string;
  customerType: 'WALK_IN' | 'REGULAR_KIRANA' | 'INSTITUTIONAL';
  itemsSummary: string;
  itemCount: number;
  subtotal: number;
  tax: number;
  discount: number;
  netTotal: number;
  paymentMode: 'CASH' | 'UPI' | 'CARD' | 'CREDIT';
  status: 'COMPLETED' | 'REFUNDED' | 'HELD';
  invoicePdfUrl?: string;
}

const MOCK_POS_ORDERS: PosOrderRecord[] = [
  {
    id: 'pos-ord-101',
    orderId: 'POS-20260917-101',
    createdAt: '17 Sept 2026, 16:42 PM',
    outletId: 'outlet-pat-01',
    outletName: 'Patna City Flagship Retail Store',
    cashierName: 'Rajesh Kumar (Shift #A)',
    customerName: 'Ramesh Sharma',
    customerMobile: '9876543210',
    customerGst: '10AAACB1234F1Z5',
    customerType: 'REGULAR_KIRANA',
    itemsSummary: 'Chakki Atta 10kg x 3, Mustard Oil 1L x 5',
    itemCount: 8,
    subtotal: 2085,
    tax: 104,
    discount: 50,
    netTotal: 2139,
    paymentMode: 'UPI',
    status: 'COMPLETED',
  },
  {
    id: 'pos-ord-102',
    orderId: 'POS-20260917-102',
    createdAt: '17 Sept 2026, 15:30 PM',
    outletId: 'outlet-pat-01',
    outletName: 'Patna City Flagship Retail Store',
    cashierName: 'Rajesh Kumar (Shift #A)',
    customerName: 'Anita Gupta (Walk-in)',
    customerMobile: '9431098765',
    customerType: 'WALK_IN',
    itemsSummary: 'Multigrain Atta 5kg x 1, Turmeric 500g x 2',
    itemCount: 3,
    subtotal: 525,
    tax: 26,
    discount: 0,
    netTotal: 551,
    paymentMode: 'CASH',
    status: 'COMPLETED',
  },
  {
    id: 'pos-ord-103',
    orderId: 'POS-20260917-103',
    createdAt: '17 Sept 2026, 14:15 PM',
    outletId: 'outlet-ind-02',
    outletName: 'Indore Central Retail Store',
    cashierName: 'Suresh Verma',
    customerName: 'Balaji Kirana Store',
    customerMobile: '9123456780',
    customerGst: '23AABCS9912E1Z8',
    customerType: 'REGULAR_KIRANA',
    itemsSummary: 'Sonamasuri Rice 5kg x 4, Arhar Dal 1kg x 10',
    itemCount: 14,
    subtotal: 2970,
    tax: 148,
    discount: 100,
    netTotal: 3018,
    paymentMode: 'CARD',
    status: 'COMPLETED',
  },
  {
    id: 'pos-ord-104',
    orderId: 'POS-20260917-104',
    createdAt: '17 Sept 2026, 12:05 PM',
    outletId: 'outlet-rnc-03',
    outletName: 'Ranchi Hub Counter',
    cashierName: 'Amit Mahato',
    customerName: 'Walk-in Store Customer',
    customerMobile: '9800011223',
    customerType: 'WALK_IN',
    itemsSummary: 'A2 Cow Ghee 1L x 1',
    itemCount: 1,
    subtotal: 1150,
    tax: 138,
    discount: 0,
    netTotal: 1288,
    paymentMode: 'UPI',
    status: 'COMPLETED',
  },
  {
    id: 'pos-ord-105',
    orderId: 'POS-20260917-105',
    createdAt: '17 Sept 2026, 11:20 AM',
    outletId: 'outlet-pat-01',
    outletName: 'Patna City Flagship Retail Store',
    cashierName: 'Rajesh Kumar (Shift #A)',
    customerName: 'Kishan Traders',
    customerMobile: '9334188220',
    customerType: 'INSTITUTIONAL',
    itemsSummary: 'Chakki Atta 10kg x 10',
    itemCount: 10,
    subtotal: 4200,
    tax: 210,
    discount: 200,
    netTotal: 4210,
    paymentMode: 'CREDIT',
    status: 'COMPLETED',
  },
];

export function PosOrdersPage() {
  const { message } = AntApp.useApp();
  const [orders] = useState<PosOrderRecord[]>(MOCK_POS_ORDERS);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [outletFilter, setOutletFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');

  // Selected Order Drawer
  const [selectedOrder, setSelectedOrder] = useState<PosOrderRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        o.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customerMobile.includes(searchQuery);
      const matchesOutlet = outletFilter === 'ALL' || o.outletId === outletFilter;
      const matchesPayment = paymentFilter === 'ALL' || o.paymentMode === paymentFilter;
      return matchesSearch && matchesOutlet && matchesPayment;
    });
  }, [orders, searchQuery, outletFilter, paymentFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.netTotal, 0);
    const cashCount = filteredOrders.filter((o) => o.paymentMode === 'CASH').length;
    const cashTotal = filteredOrders
      .filter((o) => o.paymentMode === 'CASH')
      .reduce((sum, o) => sum + o.netTotal, 0);
    const digitalTotal = filteredOrders
      .filter((o) => o.paymentMode === 'UPI' || o.paymentMode === 'CARD')
      .reduce((sum, o) => sum + o.netTotal, 0);

    return {
      totalCount: filteredOrders.length,
      totalRevenue,
      cashCount,
      cashTotal,
      digitalTotal,
    };
  }, [filteredOrders]);

  const columns: ColumnsType<PosOrderRecord> = [
    {
      title: 'Order ID & Date',
      key: 'orderId',
      width: 190,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#1890ff' }}>
            {record.orderId}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            <ClockCircleOutlined /> {record.createdAt}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Outlet Terminal',
      key: 'outlet',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.outletName}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            <UserOutlined /> Cashier: {record.cashierName}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Offline Customer Profile',
      key: 'customer',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.customerName}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            📱 {record.customerMobile}
          </Text>
          {record.customerGst && (
            <Tag color="volcano" style={{ fontSize: 10 }}>
              GST: {record.customerGst}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Items Summary',
      key: 'items',
      render: (_, record) => (
        <div>
          <Text style={{ fontSize: 12 }}>{record.itemsSummary}</Text>
          <br />
          <Tag color="blue" style={{ fontSize: 10, marginTop: 4 }}>
            {record.itemCount} Units Total
          </Tag>
        </div>
      ),
    },
    {
      title: 'Bill Amount',
      key: 'netTotal',
      width: 120,
      render: (_, record) => (
        <Text strong style={{ fontSize: 14, color: '#52c41a' }}>
          {formatCurrency(record.netTotal)}
        </Text>
      ),
    },
    {
      title: 'Payment Mode',
      key: 'paymentMode',
      width: 130,
      render: (_, record) => {
        let color = 'blue';
        let icon = <DollarOutlined />;
        if (record.paymentMode === 'CASH') {
          color = 'green';
          icon = <DollarOutlined />;
        } else if (record.paymentMode === 'UPI') {
          color = 'cyan';
          icon = <QrcodeOutlined />;
        } else if (record.paymentMode === 'CARD') {
          color = 'purple';
          icon = <CreditCardOutlined />;
        } else if (record.paymentMode === 'CREDIT') {
          color = 'orange';
          icon = <ShopOutlined />;
        }
        return (
          <Tag color={color} icon={icon}>
            {record.paymentMode}
          </Tag>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      render: (_, record) => (
        <Tag color={record.status === 'COMPLETED' ? 'success' : 'error'}>
          {record.status}
        </Tag>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 170,
      render: (_, record) => (
        <Space size={6}>
          <Button
            type="default"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedOrder(record);
              setDrawerOpen(true);
            }}
          >
            View
          </Button>
          <Tooltip title="Download / Print Bill">
            <Button
              type="primary"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => downloadPosBill(record)}
              style={{ background: '#059669', borderColor: '#059669' }}
            >
              Bill
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Can do="ORDER_VIEW" fallback={<div style={{ padding: 24 }}>Access Denied</div>}>
      <PageHeader
        title="POS Counter Orders & Invoices"
        subtitle="View all offline store counter sales, walk-in customer receipts, payment methods, and invoice re-prints."
      />

      {/* KPI Summary Header */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Today's Counter Orders"
              value={stats.totalCount}
              prefix={<ShoppingCartOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Total Counter Revenue"
              value={stats.totalRevenue}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Cash Collected"
              value={stats.cashTotal}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Digital Payments (UPI/Card)"
              value={stats.digitalTotal}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters Bar */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={10} md={8}>
            <Input
              placeholder="Search POS order ID, customer name or phone..."
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </Col>

          <Col xs={24} sm={7} md={6}>
            <Select
              value={outletFilter}
              onChange={setOutletFilter}
              style={{ width: '100%' }}
              options={[
                { value: 'ALL', label: '🏬 All Outlets' },
                { value: 'outlet-pat-01', label: 'Patna City Flagship' },
                { value: 'outlet-ind-02', label: 'Indore Central' },
                { value: 'outlet-rnc-03', label: 'Ranchi Hub' },
              ]}
            />
          </Col>

          <Col xs={24} sm={7} md={6}>
            <Select
              value={paymentFilter}
              onChange={setPaymentFilter}
              style={{ width: '100%' }}
              options={[
                { value: 'ALL', label: '💳 All Payment Modes' },
                { value: 'CASH', label: '💵 Cash' },
                { value: 'UPI', label: '📱 UPI QR' },
                { value: 'CARD', label: '💳 Card Swipe' },
                { value: 'CREDIT', label: '🏦 Store Credit' },
              ]}
            />
          </Col>

          <Col xs={24} md={4} style={{ textAlign: 'right' }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearchQuery('');
                setOutletFilter('ALL');
                setPaymentFilter('ALL');
              }}
            >
              Reset
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Main Table */}
      <Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
        <Table
          dataSource={filteredOrders}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Order Detail & Tax Invoice Drawer */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined style={{ color: '#1890ff' }} />
            <span>POS Counter Tax Invoice — {selectedOrder?.orderId}</span>
          </Space>
        }
        width={540}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => selectedOrder && downloadPosBill(selectedOrder)}
              style={{ background: '#059669', borderColor: '#059669' }}
            >
              Download Bill
            </Button>
            <Button
              icon={<PrinterOutlined />}
              onClick={() => selectedOrder && downloadPosBill(selectedOrder)}
            >
              Re-print Receipt
            </Button>
          </Space>
        }
      >
        {selectedOrder && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions title="Store & Cashier Metadata" bordered size="small" column={1}>
              <Descriptions.Item label="Outlet Store">{selectedOrder.outletName}</Descriptions.Item>
              <Descriptions.Item label="Cashier Operator">{selectedOrder.cashierName}</Descriptions.Item>
              <Descriptions.Item label="Date & Time">{selectedOrder.createdAt}</Descriptions.Item>
              <Descriptions.Item label="Order Status">
                <Tag color="success">{selectedOrder.status}</Tag>
              </Descriptions.Item>
            </Descriptions>

            <Descriptions title="Offline Customer Details" bordered size="small" column={1}>
              <Descriptions.Item label="Customer Name">{selectedOrder.customerName}</Descriptions.Item>
              <Descriptions.Item label="Mobile Number">{selectedOrder.customerMobile}</Descriptions.Item>
              <Descriptions.Item label="Customer Type">
                <Tag color="blue">{selectedOrder.customerType}</Tag>
              </Descriptions.Item>
              {selectedOrder.customerGst && (
                <Descriptions.Item label="GSTIN">{selectedOrder.customerGst}</Descriptions.Item>
              )}
            </Descriptions>

            <Descriptions title="Bill Amount & Payment Method" bordered size="small" column={1}>
              <Descriptions.Item label="Items Summary">{selectedOrder.itemsSummary}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{formatCurrency(selectedOrder.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Tax (GST)">{formatCurrency(selectedOrder.tax)}</Descriptions.Item>
              <Descriptions.Item label="Discount">-{formatCurrency(selectedOrder.discount)}</Descriptions.Item>
              <Descriptions.Item label="Net Payable">
                <Text strong style={{ fontSize: 16, color: '#52c41a' }}>
                  {formatCurrency(selectedOrder.netTotal)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Payment Mode">
                <Tag color="cyan">{selectedOrder.paymentMode}</Tag>
              </Descriptions.Item>
            </Descriptions>

            <Alert
              message="Counter Sale Completed"
              description="Inventory stock balances were automatically updated for this outlet upon transaction completion."
              type="success"
              showIcon
            />
          </Space>
        )}
      </Drawer>
    </Can>
  );
}
