import {
  BankOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  InboxOutlined,
  PhoneOutlined,
  PlusOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  RocketOutlined,
  SearchOutlined,
  ShopOutlined,
  SyncOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
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

const { Text, Title, Paragraph } = Typography;

export interface OutletLocalStock {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  availablePacks: number;
  reorderLevel: number;
  unitPrice: number;
}

export interface OutletStore {
  id: string;
  code: string;
  name: string;
  city: string;
  district: string;
  state: string;
  address: string;
  pincode: string;
  managerName: string;
  managerPhone: string;
  cashierName: string;
  posTerminalsCount: number;
  counterStatus: 'COUNTER_OPEN' | 'DAY_CLOSED' | 'RECONCILED';
  openingCash: number;
  cashCollectedToday: number;
  upiQrCollectedToday: number;
  cardSwipesToday: number;
  totalCounterSalesToday: number;
  reconciliationStatus: 'BALANCED' | 'DISCREPANCY';
  discrepancyAmount: number;
  localStockValuation: number;
  localStockCount: number;
  lowStockAlertsCount: number;
  localInventory: OutletLocalStock[];
  lastReconciledAt: string;
}

export const MOCK_OUTLETS: OutletStore[] = [
  {
    id: 'outlet-pat-01',
    code: 'OUTLET-PAT-01',
    name: 'Patna City Flagship Retail Store',
    city: 'Patna',
    district: 'Patna Central',
    state: 'Bihar',
    address: 'Shop No. 4-6, Fraser Road Commercial Complex, Near Patna Junction',
    pincode: '800001',
    managerName: 'Vikramaditya Roy',
    managerPhone: '+91 98350 11223',
    cashierName: 'Pankaj Kumar',
    posTerminalsCount: 3,
    counterStatus: 'COUNTER_OPEN',
    openingCash: 10000,
    cashCollectedToday: 48500,
    upiQrCollectedToday: 62000,
    cardSwipesToday: 38000,
    totalCounterSalesToday: 148500,
    reconciliationStatus: 'BALANCED',
    discrepancyAmount: 0,
    localStockValuation: 850000,
    localStockCount: 420,
    lowStockAlertsCount: 1,
    localInventory: [
      { productId: 'prod-1', productName: 'Desi Tokri Organic Sharbati Wheat Atta (10 KG)', sku: 'PRD-ATT-001', unit: 'KG', availablePacks: 120, reorderLevel: 30, unitPrice: 420 },
      { productId: 'prod-2', productName: 'A2 Pure Desi Cow Ghee (1 Litre Glass Jar)', sku: 'PRD-GHE-002', unit: 'LITRE', availablePacks: 45, reorderLevel: 15, unitPrice: 950 },
      { productId: 'prod-3', productName: 'Royal 1121 Premium Aged Basmati Rice (5 KG)', sku: 'PRD-RCE-003', unit: 'KG', availablePacks: 80, reorderLevel: 20, unitPrice: 590 },
      { productId: 'prod-5', productName: 'Lakadong High-Curcumin Organic Turmeric (500g)', sku: 'PRD-SPC-005', unit: 'GRAM', availablePacks: 8, reorderLevel: 20, unitPrice: 280 },
    ],
    lastReconciledAt: '16 Sept 2026 21:00',
  },
  {
    id: 'outlet-ind-02',
    code: 'OUTLET-IND-02',
    name: 'Indore Regional Depot & Counter Outlet',
    city: 'Indore',
    district: 'Indore Urban',
    state: 'Madhya Pradesh',
    address: 'Warehouse Gate #2, Mandi Yard Complex, AB Road',
    pincode: '452001',
    managerName: 'Sunil Mahajan',
    managerPhone: '+91 99260 44556',
    cashierName: 'Rahul Chouhan',
    posTerminalsCount: 2,
    counterStatus: 'COUNTER_OPEN',
    openingCash: 8000,
    cashCollectedToday: 36000,
    upiQrCollectedToday: 54500,
    cardSwipesToday: 21000,
    totalCounterSalesToday: 111500,
    reconciliationStatus: 'BALANCED',
    discrepancyAmount: 0,
    localStockValuation: 640000,
    localStockCount: 310,
    lowStockAlertsCount: 0,
    localInventory: [
      { productId: 'prod-1', productName: 'Desi Tokri Organic Sharbati Wheat Atta (10 KG)', sku: 'PRD-ATT-001', unit: 'KG', availablePacks: 95, reorderLevel: 30, unitPrice: 420 },
      { productId: 'prod-4', productName: 'Cold-Pressed Kachi Ghani Mustard Oil (5 L Tin)', sku: 'PRD-OIL-004', unit: 'LITRE', availablePacks: 60, reorderLevel: 15, unitPrice: 820 },
    ],
    lastReconciledAt: '16 Sept 2026 20:30',
  },
  {
    id: 'outlet-vns-03',
    code: 'OUTLET-VNS-03',
    name: 'Varanasi Heritage Organic Store',
    city: 'Varanasi',
    district: 'Varanasi',
    state: 'Uttar Pradesh',
    address: 'B-14, Godowlia Crossing, Near Kashi Temple Road',
    pincode: '221001',
    managerName: 'Anand Mishra',
    managerPhone: '+91 94150 77889',
    cashierName: 'Shivam Pandey',
    posTerminalsCount: 2,
    counterStatus: 'DAY_CLOSED',
    openingCash: 5000,
    cashCollectedToday: 29000,
    upiQrCollectedToday: 41000,
    cardSwipesToday: 18500,
    totalCounterSalesToday: 88500,
    reconciliationStatus: 'BALANCED',
    discrepancyAmount: 0,
    localStockValuation: 490000,
    localStockCount: 240,
    lowStockAlertsCount: 2,
    localInventory: [
      { productId: 'prod-2', productName: 'A2 Pure Desi Cow Ghee (1 Litre Glass Jar)', sku: 'PRD-GHE-002', unit: 'LITRE', availablePacks: 22, reorderLevel: 10, unitPrice: 950 },
      { productId: 'prod-6', productName: 'Premium Organic Phool Makhana Jumbo (250g)', sku: 'PRD-NUT-006', unit: 'GRAM', availablePacks: 110, reorderLevel: 25, unitPrice: 310 },
    ],
    lastReconciledAt: '17 Sept 2026 15:45',
  },
  {
    id: 'outlet-jpr-04',
    code: 'OUTLET-JPR-04',
    name: 'Jaipur Wholesale & POS Retail Hub',
    city: 'Jaipur',
    district: 'Jaipur Central',
    state: 'Rajasthan',
    address: 'Shop #8, Surajpole Grain Mandi Road',
    pincode: '302003',
    managerName: 'Mahendra Singh Rathore',
    managerPhone: '+91 98290 33445',
    cashierName: 'Deepak Sharma',
    posTerminalsCount: 1,
    counterStatus: 'COUNTER_OPEN',
    openingCash: 5000,
    cashCollectedToday: 19500,
    upiQrCollectedToday: 32000,
    cardSwipesToday: 12000,
    totalCounterSalesToday: 63500,
    reconciliationStatus: 'BALANCED',
    discrepancyAmount: 0,
    localStockValuation: 380000,
    localStockCount: 190,
    lowStockAlertsCount: 0,
    localInventory: [
      { productId: 'prod-4', productName: 'Cold-Pressed Kachi Ghani Mustard Oil (5 L Tin)', sku: 'PRD-OIL-004', unit: 'LITRE', availablePacks: 35, reorderLevel: 10, unitPrice: 820 },
      { productId: 'prod-7', productName: 'Unpolished Desi Chana Dal / Bengal Gram (1 KG)', sku: 'PRD-PUL-007', unit: 'KG', availablePacks: 65, reorderLevel: 20, unitPrice: 110 },
    ],
    lastReconciledAt: '16 Sept 2026 21:15',
  },
];

/**
 * Slide-Out Outlet Detail & POS Cash Reconciliation Drawer
 */
function OutletDetailDrawer({
  open,
  outlet,
  onClose,
  onTriggerStockTransfer,
}: {
  open: boolean;
  outlet: OutletStore | null;
  onClose: () => void;
  onTriggerStockTransfer: (outletId: string, sku: string) => void;
}) {
  if (!outlet) return null;

  return (
    <Drawer
      title={
        <Space align="center" size={12}>
          <ShopOutlined style={{ color: '#1677ff', fontSize: 20 }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {outlet.name}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              POS Counter Hub & Local Stock Balances ({outlet.code})
            </Text>
          </div>
        </Space>
      }
      width={760}
      open={open}
      onClose={onClose}
      extra={<Button onClick={onClose}>Close</Button>}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Counter Operating Status Banner */}
        <Card
          size="small"
          style={{
            borderRadius: 12,
            background: outlet.counterStatus === 'COUNTER_OPEN' ? '#f6ffed' : '#fffbe6',
            borderColor: outlet.counterStatus === 'COUNTER_OPEN' ? '#b7eb8f' : '#ffe58f',
          }}
        >
          <Row justify="space-between" align="middle">
            <Col>
              <Space size={8}>
                <Tag color={outlet.counterStatus === 'COUNTER_OPEN' ? 'green' : 'gold'} style={{ fontWeight: 700 }}>
                  {outlet.counterStatus.replace('_', ' ')}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  POS Terminals Active: <strong>{outlet.posTerminalsCount} Machines</strong>
                </Text>
              </Space>
            </Col>
            <Col>
              <Space size={6}>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <Text strong style={{ color: '#52c41a', fontSize: 13 }}>
                  Reconciliation Status: {outlet.reconciliationStatus} (Zero Discrepancy)
                </Text>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Store & Manager Information */}
        <Card size="small" title="1. Outlet Location & Store Manager Profile" style={{ borderRadius: 8 }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Outlet Store Code">
              <Text code>{outlet.code}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Store Manager">{outlet.managerName}</Descriptions.Item>
            <Descriptions.Item label="Manager Phone">{outlet.managerPhone}</Descriptions.Item>
            <Descriptions.Item label="Counter Cashier">{outlet.cashierName}</Descriptions.Item>
            <Descriptions.Item label="Physical Address" span={2}>
              {outlet.address}, {outlet.city}, {outlet.state} - {outlet.pincode}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Daily Counter Cash & Digital Payment Reconciliation */}
        <Card
          size="small"
          title={
            <Space>
              <DollarOutlined style={{ color: '#52c41a' }} />
              <span>2. Today's POS Counter Cash & Digital Reconciliation Audit</span>
            </Space>
          }
          style={{ borderRadius: 8, background: '#f8fafc' }}
        >
          <Row gutter={[12, 12]}>
            <Col span={6}>
              <Statistic
                title="Opening Counter Cash"
                value={outlet.openingCash}
                prefix="₹"
                valueStyle={{ fontSize: 16 }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Cash Collected"
                value={outlet.cashCollectedToday}
                prefix="₹"
                valueStyle={{ fontSize: 16, color: '#16a34a' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="UPI / QR Payments"
                value={outlet.upiQrCollectedToday}
                prefix="₹"
                valueStyle={{ fontSize: 16, color: '#0284c7' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Card Machine Swipes"
                value={outlet.cardSwipesToday}
                prefix="₹"
                valueStyle={{ fontSize: 16, color: '#7c3aed' }}
              />
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Row justify="space-between" align="middle">
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Net Closing Cash in Drawer:
              </Text>
              <Title level={4} style={{ margin: 0, color: '#15803d' }}>
                {formatCurrency(outlet.openingCash + outlet.cashCollectedToday)}
              </Title>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Total Today's Counter Billing Sales:
              </Text>
              <Title level={4} style={{ margin: 0, color: '#1e293b' }}>
                {formatCurrency(outlet.totalCounterSalesToday)}
              </Title>
            </div>
            <div>
              <Tag color="green" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12 }}>
                ✔ Reconciled & Audited
              </Tag>
            </div>
          </Row>
        </Card>

        {/* Outlet Local Stock Inventory */}
        <Card size="small" title="3. Outlet Local Stock Inventory & Reorder Thresholds" style={{ borderRadius: 8 }}>
          <Table<OutletLocalStock>
            dataSource={outlet.localInventory}
            rowKey="sku"
            pagination={false}
            size="small"
            columns={[
              {
                title: 'Product & SKU',
                key: 'product',
                render: (_, record) => (
                  <Space direction="vertical" size={0}>
                    <Text strong style={{ fontSize: 12 }}>
                      {record.productName}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      SKU: {record.sku} · Unit: {record.unit}
                    </Text>
                  </Space>
                ),
              },
              {
                title: 'Outlet Stock',
                key: 'stock',
                width: 140,
                render: (_, record) => {
                  const isLow = record.availablePacks <= record.reorderLevel;
                  return (
                    <Space direction="vertical" size={0}>
                      <Text strong style={{ color: isLow ? '#cf1322' : '#15803d', fontSize: 13 }}>
                        {record.availablePacks} Packs
                      </Text>
                      {isLow ? (
                        <Tag color="error" style={{ fontSize: 9, padding: '0 4px', margin: 0 }}>
                          LOW (≤{record.reorderLevel})
                        </Tag>
                      ) : (
                        <Tag color="success" style={{ fontSize: 9, padding: '0 4px', margin: 0 }}>
                          IN STOCK
                        </Tag>
                      )}
                    </Space>
                  );
                },
              },
              {
                title: 'Unit Price',
                dataIndex: 'unitPrice',
                key: 'unitPrice',
                width: 100,
                render: (price: number) => formatCurrency(price),
              },
              {
                title: 'Action',
                key: 'action',
                width: 150,
                render: (_, record) => (
                  <Button
                    size="small"
                    type="dashed"
                    icon={<RocketOutlined />}
                    onClick={() => onTriggerStockTransfer(outlet.id, record.sku)}
                    style={{ fontSize: 11 }}
                  >
                    Transfer Stock
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </Drawer>
  );
}

/**
 * Drawer Form Modal to Add or Edit Outlet Details
 */
function OutletFormDrawer({
  open,
  outlet,
  onClose,
  onSave,
}: {
  open: boolean;
  outlet: OutletStore | null;
  onClose: () => void;
  onSave: (values: Partial<OutletStore>) => void;
}) {
  const [form] = Form.useForm<OutletStore>();

  const isEdit = Boolean(outlet);

  const handleFinish = (values: OutletStore) => {
    onSave(values);
  };

  return (
    <Modal
      title={isEdit ? `Edit Outlet Details — ${outlet?.code}` : 'Register New Physical Outlet'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Save Outlet Changes' : 'Create Physical Outlet'}
      width={640}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={
          outlet || {
            code: `OUTLET-${Math.floor(100 + Math.random() * 900)}`,
            counterStatus: 'COUNTER_OPEN',
            posTerminalsCount: 2,
            openingCash: 5000,
            state: 'Bihar',
          }
        }
        onFinish={handleFinish}
      >
        <Row gutter={16}>
          <Col span={14}>
            <Form.Item
              name="name"
              label="Outlet / Store Name"
              rules={[{ required: true, message: 'Please enter store name' }]}
            >
              <Input placeholder="e.g. Ranchi Retail Hub" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item
              name="code"
              label="Outlet Code"
              rules={[{ required: true, message: 'Please enter outlet code' }]}
            >
              <Input placeholder="e.g. OUTLET-RNC-05" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="city" label="City" rules={[{ required: true, message: 'City required' }]}>
              <Input placeholder="e.g. Ranchi" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="district" label="District" rules={[{ required: true, message: 'District required' }]}>
              <Input placeholder="e.g. Ranchi Central" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="state" label="State" rules={[{ required: true, message: 'State required' }]}>
              <Input placeholder="e.g. Jharkhand" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="address"
          label="Physical Store Address"
          rules={[{ required: true, message: 'Store address required' }]}
        >
          <Input.TextArea rows={2} placeholder="Full street address, landmark and mandi details" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="managerName"
              label="Store Manager Name"
              rules={[{ required: true, message: 'Manager name required' }]}
            >
              <Input placeholder="e.g. Ramesh Chandra" prefix={<UserOutlined />} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="managerPhone"
              label="Manager Phone Number"
              rules={[{ required: true, message: 'Manager phone required' }]}
            >
              <Input placeholder="e.g. +91 98765 43210" prefix={<PhoneOutlined />} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="cashierName"
              label="Default Counter Cashier"
              rules={[{ required: true, message: 'Cashier name required' }]}
            >
              <Input placeholder="e.g. Pankaj Sharma" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="posTerminalsCount"
              label="POS Machine Terminals Count"
              rules={[{ required: true, message: 'Terminal count required' }]}
            >
              <InputNumber min={1} max={20} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="counterStatus" label="Counter Operating Status">
              <Select
                options={[
                  { value: 'COUNTER_OPEN', label: '🟢 COUNTER OPEN' },
                  { value: 'DAY_CLOSED', label: '🟡 DAY CLOSED' },
                  { value: 'RECONCILED', label: '🔵 RECONCILED' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="openingCash" label="Opening Drawer Cash (₹)">
              <InputNumber min={0} prefix="₹" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

/**
 * Super Admin Physical Outlet & POS Terminal Hub Console Page (`/outlets`)
 */
export function OutletsPage() {
  const { message } = AntApp.useApp();
  const [outlets, setOutlets] = useState<OutletStore[]>(MOCK_OUTLETS);
  const [selectedOutlet, setSelectedOutlet] = useState<OutletStore | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<OutletStore | null>(null);

  const handleOpenDrawer = (store: OutletStore) => {
    setSelectedOutlet(store);
    setDrawerOpen(true);
  };

  const handleOpenAddModal = () => {
    setEditingOutlet(null);
    setEditModalOpen(true);
  };

  const handleOpenEditModal = (store: OutletStore) => {
    setEditingOutlet(store);
    setEditModalOpen(true);
  };

  const handleDeleteOutlet = (id: string) => {
    setOutlets((prev) => prev.filter((o) => o.id !== id));
    message.success('Outlet deleted successfully.');
  };

  const handleSaveOutlet = (values: Partial<OutletStore>) => {
    if (editingOutlet) {
      // Edit existing outlet
      setOutlets((prev) =>
        prev.map((o) => (o.id === editingOutlet.id ? ({ ...o, ...values } as OutletStore) : o)),
      );
      message.success(`Outlet "${values.name || editingOutlet.name}" updated successfully!`);
    } else {
      // Create new outlet
      const newOutlet: OutletStore = {
        id: `outlet-${Date.now()}`,
        code: values.code || `OUTLET-${Math.floor(100 + Math.random() * 900)}`,
        name: values.name || 'New Physical Outlet',
        city: values.city || 'Patna',
        district: values.district || 'Central',
        state: values.state || 'Bihar',
        address: values.address || 'Address details',
        pincode: values.pincode || '800001',
        managerName: values.managerName || 'Manager Name',
        managerPhone: values.managerPhone || '+91 90000 00000',
        cashierName: values.cashierName || 'Cashier Name',
        posTerminalsCount: values.posTerminalsCount || 2,
        counterStatus: values.counterStatus || 'COUNTER_OPEN',
        openingCash: values.openingCash || 5000,
        cashCollectedToday: 0,
        upiQrCollectedToday: 0,
        cardSwipesToday: 0,
        totalCounterSalesToday: 0,
        reconciliationStatus: 'BALANCED',
        discrepancyAmount: 0,
        localStockValuation: 250000,
        localStockCount: 150,
        lowStockAlertsCount: 0,
        localInventory: [],
        lastReconciledAt: 'Just now',
      };
      setOutlets((prev) => [newOutlet, ...prev]);
      message.success(`New Outlet "${newOutlet.name}" registered successfully!`);
    }
    setEditModalOpen(false);
  };

  const handleTriggerStockTransfer = (outletId: string, sku: string) => {
    message.success(`Stock transfer dispatch initiated for SKU ${sku} from Central Hub to Outlet.`);
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const totalOutlets = outlets.length;
    const totalCashToday = outlets.reduce((acc, o) => acc + o.cashCollectedToday, 0);
    const totalDigitalToday = outlets.reduce((acc, o) => acc + o.upiQrCollectedToday + o.cardSwipesToday, 0);
    const totalValuation = outlets.reduce((acc, o) => acc + o.localStockValuation, 0);

    return { totalOutlets, totalCashToday, totalDigitalToday, totalValuation };
  }, [outlets]);

  // Filtered outlets
  const filteredOutlets = useMemo(() => {
    return outlets.filter((o) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = o.name.toLowerCase().includes(q);
        const matchesCode = o.code.toLowerCase().includes(q);
        const matchesCity = o.city.toLowerCase().includes(q);
        const matchesManager = o.managerName.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesCity && !matchesManager) return false;
      }
      return true;
    });
  }, [outlets, searchQuery]);

  const columns: ColumnsType<OutletStore> = [
    {
      title: 'Outlet Code & Store Name',
      key: 'outlet',
      width: 280,
      render: (_, record) => (
        <Space align="start" size={12}>
          <Avatar
            shape="square"
            size={44}
            icon={<ShopOutlined />}
            style={{ backgroundColor: '#1677ff', color: '#fff', flexShrink: 0 }}
          />
          <Space direction="vertical" size={2}>
            <Text strong style={{ fontSize: 13, color: '#0f172a' }}>
              {record.name}
            </Text>
            <Space size={6}>
              <Tag color="cyan" style={{ fontSize: 10 }}>
                {record.code}
              </Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>
                📍 {record.city}, {record.state}
              </Text>
            </Space>
          </Space>
        </Space>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Store Manager & POS Count',
      key: 'manager',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 12 }}>
            {record.managerName}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            📞 {record.managerPhone}
          </Text>
          <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
            {record.posTerminalsCount} POS Terminals
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Today Counter Sales',
      key: 'sales',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13, color: '#15803d' }}>
            {formatCurrency(record.totalCounterSalesToday)}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Cash: {formatCurrency(record.cashCollectedToday)} · Digital: {formatCurrency(record.upiQrCollectedToday + record.cardSwipesToday)}
          </Text>
        </Space>
      ),
      sorter: (a, b) => a.totalCounterSalesToday - b.totalCounterSalesToday,
    },
    {
      title: 'Counter Status',
      key: 'status',
      width: 140,
      render: (_, record) => (
        <Tag color={record.counterStatus === 'COUNTER_OPEN' ? 'green' : 'gold'}>
          {record.counterStatus.replace('_', ' ')}
        </Tag>
      ),
    },
    {
      title: 'Reconciliation',
      key: 'reconciliation',
      width: 150,
      render: (_, record) => (
        <Tag color="success" style={{ fontSize: 11 }}>
          ✔ {record.reconciliationStatus}
        </Tag>
      ),
    },
    {
      title: 'Local Stock',
      key: 'stock',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 12 }}>
            {record.localStockCount} Packs
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Valuation: {formatCurrency(record.localStockValuation)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 210,
      fixed: 'right',
      render: (_, record) => (
        <Space size={6}>
          <Tooltip title="Inspect Outlet Details & Stock">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenDrawer(record)}
              style={{ borderRadius: 6 }}
            >
              Inspect
            </Button>
          </Tooltip>

          <Tooltip title="Edit Outlet Info">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEditModal(record)}
            />
          </Tooltip>

          <Popconfirm
            title="Delete Physical Outlet"
            description={`Are you sure you want to delete "${record.name}"?`}
            onConfirm={() => handleDeleteOutlet(record.id)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete Outlet">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Can do="STOCK_VIEW" fallback={<div style={{ padding: 24 }}>Access Denied</div>}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Page Header */}
        <PageHeader
          title="Physical Outlet & POS Terminal Hub"
          subtitle="Super Admin Operations Console: Manage company-owned retail stores, POS counter machine terminals, local outlet stock balances, and daily counter cash/digital reconciliations."
          actions={[
            <Button
              key="add"
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenAddModal}
            >
              Register New Outlet
            </Button>,
          ]}
        />

        {/* Summary KPI Widgets */}
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={6}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="Active Physical Outlets"
                value={metrics.totalOutlets}
                prefix={<ShopOutlined style={{ color: '#1677ff', fontSize: 18 }} />}
                valueStyle={{ fontSize: 22, fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="Today POS Cash Drawer Balance"
                value={metrics.totalCashToday}
                prefix={<DollarOutlined style={{ color: '#16a34a', fontSize: 18 }} />}
                precision={0}
                valueStyle={{ color: '#16a34a', fontSize: 22, fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="Digital QR & Card POS Swipes"
                value={metrics.totalDigitalToday}
                prefix={<QrcodeOutlined style={{ color: '#0284c7', fontSize: 18 }} />}
                precision={0}
                valueStyle={{ color: '#0284c7', fontSize: 22, fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card size="small" style={{ borderRadius: 8 }}>
              <Statistic
                title="Outlet Stock Valuation"
                value={metrics.totalValuation}
                prefix={<BarChartOutlined style={{ color: '#7c3aed', fontSize: 18 }} />}
                precision={0}
                valueStyle={{ color: '#7c3aed', fontSize: 22, fontWeight: 700 }}
              />
            </Card>
          </Col>
        </Row>

        {/* Table Card */}
        <Card bodyStyle={{ padding: 16 }} style={{ borderRadius: 8 }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Row justify="space-between" align="middle">
              <Text strong style={{ fontSize: 14 }}>
                Company Outlets & POS Counter Terminal Registry ({filteredOutlets.length})
              </Text>

              <Space>
                <Input
                  placeholder="Search by Outlet Name, Code, City, or Manager..."
                  prefix={<SearchOutlined />}
                  allowClear
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: 340 }}
                />

                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleOpenAddModal}
                >
                  Add Outlet
                </Button>
              </Space>
            </Row>

            <Table<OutletStore>
              columns={columns}
              dataSource={filteredOutlets}
              rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: true }}
              size="middle"
              scroll={{ x: 1100 }}
            />
          </Space>
        </Card>

        {/* Outlet Detail Drawer */}
        <OutletDetailDrawer
          open={drawerOpen}
          outlet={selectedOutlet}
          onClose={() => setDrawerOpen(false)}
          onTriggerStockTransfer={handleTriggerStockTransfer}
        />

        {/* Add / Edit Outlet Form Drawer */}
        <OutletFormDrawer
          open={editModalOpen}
          outlet={editingOutlet}
          onClose={() => setEditModalOpen(false)}
          onSave={handleSaveOutlet}
        />
      </Space>
    </Can>
  );
}
