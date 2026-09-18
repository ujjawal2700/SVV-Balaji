import {
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FileDoneOutlined,
  PieChartOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency } from '../../utils/format';

const { Text, Title, Paragraph } = Typography;

export interface ShiftReconciliationRecord {
  id: string;
  shiftId: string;
  outletId: string;
  outletName: string;
  cashierName: string;
  shiftTime: string;
  openingCash: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  creditSales: number;
  totalSales: number;
  expectedCashInDrawer: number;
  actualCashCounted: number;
  discrepancy: number;
  status: 'OPEN' | 'BALANCED' | 'DISCREPANCY';
}

const MOCK_SHIFTS: ShiftReconciliationRecord[] = [
  {
    id: 'shift-01',
    shiftId: 'SHIFT-20260917-A',
    outletId: 'outlet-pat-01',
    outletName: 'Patna City Flagship Store',
    cashierName: 'Rajesh Kumar (Shift #A)',
    shiftTime: '09:00 AM - 05:00 PM',
    openingCash: 5000,
    cashSales: 12450,
    upiSales: 18900,
    cardSales: 6400,
    creditSales: 4210,
    totalSales: 41960,
    expectedCashInDrawer: 17450,
    actualCashCounted: 17450,
    discrepancy: 0,
    status: 'BALANCED',
  },
  {
    id: 'shift-02',
    shiftId: 'SHIFT-20260917-B',
    outletId: 'outlet-ind-02',
    outletName: 'Indore Central Retail Store',
    cashierName: 'Suresh Verma',
    shiftTime: '10:00 AM - 06:00 PM',
    openingCash: 3000,
    cashSales: 8400,
    upiSales: 14200,
    cardSales: 3018,
    creditSales: 0,
    totalSales: 25618,
    expectedCashInDrawer: 11400,
    actualCashCounted: 11400,
    discrepancy: 0,
    status: 'BALANCED',
  },
  {
    id: 'shift-03',
    shiftId: 'SHIFT-20260917-C',
    outletId: 'outlet-rnc-03',
    outletName: 'Ranchi Hub Counter',
    cashierName: 'Amit Mahato',
    shiftTime: '09:30 AM - 05:30 PM',
    openingCash: 2500,
    cashSales: 4800,
    upiSales: 6500,
    cardSales: 1288,
    creditSales: 0,
    totalSales: 12588,
    expectedCashInDrawer: 7300,
    actualCashCounted: 7250,
    discrepancy: -50,
    status: 'DISCREPANCY',
  },
];

const MOCK_TOP_COUNTER_ITEMS = [
  { sku: 'FG-ATT-10KG', name: 'Shree Vighnaharta Chakki Atta (10 KG)', category: 'Flour', soldQty: 142, revenue: 59640 },
  { sku: 'FG-OIL-01L', name: 'Pure Kachi Ghani Mustard Oil (1 Litre)', category: 'Edible Oils', soldQty: 98, revenue: 16170 },
  { sku: 'FG-RIC-05KG', name: 'Organic Sonamasuri Rice (5 KG Pack)', category: 'Grains', soldQty: 64, revenue: 24320 },
  { sku: 'FG-PUL-01KG', name: 'Organic Arhar / Toor Dal (1 KG)', category: 'Pulses', soldQty: 85, revenue: 12325 },
  { sku: 'FG-GHE-01L', name: 'Pure Desi A2 Cow Ghee (1 Litre Jar)', category: 'Dairy', soldQty: 24, revenue: 27600 },
];

export function PosReportsPage() {
  const { message } = AntApp.useApp();
  const [shifts, setShifts] = useState<ShiftReconciliationRecord[]>(MOCK_SHIFTS);
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>('ALL');

  // Modal State for Shift Close & Reconciliation
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [activeShift, setActiveShift] = useState<ShiftReconciliationRecord | null>(null);
  const [reconcileForm] = Form.useForm<{ actualCash: number; notes: string }>();

  // Filtered Shifts
  const filteredShifts = shifts.filter((s) =>
    selectedOutletFilter === 'ALL' ? true : s.outletId === selectedOutletFilter,
  );

  // Overall KPI aggregates
  const totalRevenue = filteredShifts.reduce((sum, s) => sum + s.totalSales, 0);
  const totalCashSales = filteredShifts.reduce((sum, s) => sum + s.cashSales, 0);
  const totalUpiSales = filteredShifts.reduce((sum, s) => sum + s.upiSales, 0);
  const totalCardSales = filteredShifts.reduce((sum, s) => sum + s.cardSales, 0);
  const totalCreditSales = filteredShifts.reduce((sum, s) => sum + s.creditSales, 0);
  const totalDigitalSales = totalUpiSales + totalCardSales;

  const handleOpenReconcileModal = (shift: ShiftReconciliationRecord) => {
    setActiveShift(shift);
    reconcileForm.setFieldsValue({
      actualCash: shift.actualCashCounted,
      notes: '',
    });
    setReconcileModalOpen(true);
  };

  const handleSaveReconciliation = (values: { actualCash: number; notes: string }) => {
    if (!activeShift) return;
    const diff = values.actualCash - activeShift.expectedCashInDrawer;
    const newStatus = diff === 0 ? 'BALANCED' : 'DISCREPANCY';

    setShifts((prev) =>
      prev.map((s) =>
        s.id === activeShift.id
          ? {
              ...s,
              actualCashCounted: values.actualCash,
              discrepancy: diff,
              status: newStatus,
            }
          : s,
      ),
    );

    message.success(`Shift reconciliation saved for ${activeShift.shiftId}! Status: ${newStatus}`);
    setReconcileModalOpen(false);
  };

  const shiftColumns: ColumnsType<ShiftReconciliationRecord> = [
    {
      title: 'Shift ID & Outlet',
      key: 'shift',
      width: 230,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: '#1890ff' }}>
            {record.shiftId}
          </Text>
          <Text style={{ fontSize: 12 }}>
            <ShopOutlined /> {record.outletName}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            <UserOutlined /> {record.cashierName}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Opening Cash',
      key: 'openingCash',
      width: 120,
      render: (_, record) => <Text>{formatCurrency(record.openingCash)}</Text>,
    },
    {
      title: 'Cash Sales',
      key: 'cashSales',
      width: 120,
      render: (_, record) => <Text style={{ color: '#52c41a' }}>{formatCurrency(record.cashSales)}</Text>,
    },
    {
      title: 'Digital Sales',
      key: 'digitalSales',
      width: 140,
      render: (_, record) => (
        <Text style={{ color: '#13c2c2' }}>{formatCurrency(record.upiSales + record.cardSales)}</Text>
      ),
    },
    {
      title: 'Total Revenue',
      key: 'totalSales',
      width: 140,
      render: (_, record) => <Text strong>{formatCurrency(record.totalSales)}</Text>,
    },
    {
      title: 'Expected Cash',
      key: 'expected',
      width: 130,
      render: (_, record) => <Text strong>{formatCurrency(record.expectedCashInDrawer)}</Text>,
    },
    {
      title: 'Actual Counted',
      key: 'actual',
      width: 130,
      render: (_, record) => (
        <Text strong style={{ color: record.discrepancy < 0 ? '#ff4d4f' : '#52c41a' }}>
          {formatCurrency(record.actualCashCounted)}
        </Text>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 170,
      render: (_, record) => (
        <Tag color={record.status === 'BALANCED' ? 'success' : 'warning'}>
          {record.status === 'BALANCED' ? 'BALANCED (₹0)' : `DISCREPANCY (${formatCurrency(record.discrepancy)})`}
        </Tag>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<FileDoneOutlined />}
          onClick={() => handleOpenReconcileModal(record)}
        >
          Reconcile Shift
        </Button>
      ),
    },
  ];

  return (
    <Can do="ORDER_VIEW" fallback={<div style={{ padding: 24 }}>Access Denied</div>}>
      <PageHeader
        title="POS Sale Reports & Cash Shift Reconciliation"
        subtitle="Analyze offline counter performance, cashier shift logs, payment method splits, and cash drawer reconciliations."
        actions={[
          <Select
            key="outlet"
            value={selectedOutletFilter}
            onChange={setSelectedOutletFilter}
            style={{ width: 240 }}
            options={[
              { value: 'ALL', label: '🏬 All Physical Outlets' },
              { value: 'outlet-pat-01', label: 'Patna City Flagship' },
              { value: 'outlet-ind-02', label: 'Indore Central Store' },
              { value: 'outlet-rnc-03', label: 'Ranchi Hub Counter' },
            ]}
          />,
        ]}
      />

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Today's Counter Revenue"
              value={totalRevenue}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Cash Collected in Drawer"
              value={totalCashSales}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Digital Collections (UPI + Cards)"
              value={totalDigitalSales}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Store Credit Sales"
              value={totalCreditSales}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Payment Method Distribution Visual Breakdown */}
      <Card
        title={
          <Space>
            <PieChartOutlined style={{ color: '#1890ff' }} />
            <span>Counter Sales Payment Channel Breakdown</span>
          </Space>
        }
        style={{ marginBottom: 20, borderRadius: 8 }}
      >
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={6}>
            <Text type="secondary">Cash Payment ({Math.round((totalCashSales / (totalRevenue || 1)) * 100)}%)</Text>
            <Progress percent={Math.round((totalCashSales / (totalRevenue || 1)) * 100)} strokeColor="#52c41a" />
            <Text strong>{formatCurrency(totalCashSales)}</Text>
          </Col>

          <Col xs={24} md={6}>
            <Text type="secondary">UPI Dynamic QR ({Math.round((totalUpiSales / (totalRevenue || 1)) * 100)}%)</Text>
            <Progress percent={Math.round((totalUpiSales / (totalRevenue || 1)) * 100)} strokeColor="#13c2c2" />
            <Text strong>{formatCurrency(totalUpiSales)}</Text>
          </Col>

          <Col xs={24} md={6}>
            <Text type="secondary">Card Terminal Swipe ({Math.round((totalCardSales / (totalRevenue || 1)) * 100)}%)</Text>
            <Progress percent={Math.round((totalCardSales / (totalRevenue || 1)) * 100)} strokeColor="#1890ff" />
            <Text strong>{formatCurrency(totalCardSales)}</Text>
          </Col>

          <Col xs={24} md={6}>
            <Text type="secondary">Kirana Store Credit ({Math.round((totalCreditSales / (totalRevenue || 1)) * 100)}%)</Text>
            <Progress percent={Math.round((totalCreditSales / (totalRevenue || 1)) * 100)} strokeColor="#722ed1" />
            <Text strong>{formatCurrency(totalCreditSales)}</Text>
          </Col>
        </Row>
      </Card>

      {/* Cashier Shift Reconciliation Table */}
      <Card
        title={
          <Space>
            <ClockCircleOutlined style={{ color: '#fa8c16' }} />
            <span>Cashier Shift Cash Drawer Reconciliations</span>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
        style={{ marginBottom: 20, borderRadius: 8 }}
      >
        <Table
          dataSource={filteredShifts}
          columns={shiftColumns}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Top Counter Selling Items */}
      <Card
        title={
          <Space>
            <BarChartOutlined style={{ color: '#52c41a' }} />
            <span>Top Selling Products at Offline Store Counters Today</span>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <Table
          dataSource={MOCK_TOP_COUNTER_ITEMS}
          rowKey="sku"
          pagination={false}
          size="small"
          scroll={{ x: 750 }}
          columns={[
            { title: 'SKU', dataIndex: 'sku', key: 'sku', render: (val) => <Tag color="blue">{val}</Tag> },
            { title: 'Product Name', dataIndex: 'name', key: 'name', render: (val) => <Text strong>{val}</Text> },
            { title: 'Category', dataIndex: 'category', key: 'category' },
            { title: 'Counter Units Sold', dataIndex: 'soldQty', key: 'soldQty', render: (val) => <Text strong>{val} Units</Text> },
            { title: 'Total Counter Revenue', dataIndex: 'revenue', key: 'revenue', render: (val) => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(val)}</Text> },
          ]}
        />
      </Card>

      {/* Shift Reconcile Modal */}
      <Modal
        title={`Shift Cash Reconciliation — ${activeShift?.shiftId}`}
        open={reconcileModalOpen}
        onCancel={() => setReconcileModalOpen(false)}
        onOk={() => reconcileForm.submit()}
        okText="Submit Shift Reconciliation"
        width={500}
      >
        {activeShift && (
          <Form
            form={reconcileForm}
            layout="vertical"
            onFinish={handleSaveReconciliation}
          >
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Outlet">{activeShift.outletName}</Descriptions.Item>
              <Descriptions.Item label="Cashier">{activeShift.cashierName}</Descriptions.Item>
              <Descriptions.Item label="Opening Cash">{formatCurrency(activeShift.openingCash)}</Descriptions.Item>
              <Descriptions.Item label="Counter Cash Sales">{formatCurrency(activeShift.cashSales)}</Descriptions.Item>
              <Descriptions.Item label="Expected Cash in Drawer">
                <Text strong style={{ fontSize: 15, color: '#1890ff' }}>
                  {formatCurrency(activeShift.expectedCashInDrawer)}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Form.Item
              name="actualCash"
              label="Actual Physical Cash Counted in Drawer (₹)"
              rules={[{ required: true, message: 'Please enter physical cash counted' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                prefix="₹"
                size="large"
              />
            </Form.Item>

            <Form.Item name="notes" label="Reconciliation / Variance Remarks">
              <Input.TextArea rows={2} placeholder="Optional notes regarding discrepancy or shift handoff" />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Can>
  );
}
