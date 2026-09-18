import {
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  FileTextOutlined,
  FilterOutlined,
  InboxOutlined,
  PhoneOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingOutlined,
  SyncOutlined,
  TeamOutlined,
  TruckOutlined,
  UserOutlined,
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
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency } from '../../utils/format';
import { downloadOrderBill } from '../../utils/invoiceGenerator';
import {
  FranchiseStore,
  FranchiseSupplyOrder,
  getStoredFranchiseOrders,
  getStoredFranchises,
  saveStoredFranchiseOrders,
  saveStoredFranchises,
} from './franchiseData';

const { Text, Title, Paragraph } = Typography;

export function FranchiseOrdersPage() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();

  // State initialized from localStorage / defaults
  const [franchises, setFranchises] = useState<FranchiseStore[]>([]);
  const [orders, setOrders] = useState<FranchiseSupplyOrder[]>([]);
  const [selectedFranchiseFilter, setSelectedFranchiseFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();

  useEffect(() => {
    setFranchises(getStoredFranchises());
    setOrders(getStoredFranchiseOrders());
  }, []);

  // Stats Calculations
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalSuppliedValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalWeightTonnes = (orders.reduce((sum, o) => sum + o.totalWeightKg, 0) / 1000).toFixed(1);
    const totalOutstandingCredit = franchises.reduce((sum, f) => sum + f.outstandingBalance, 0);
    const inTransitOrders = orders.filter(
      (o) => o.fulfillmentStatus === 'IN_TRANSIT' || o.fulfillmentStatus === 'DISPATCHED',
    ).length;

    return {
      totalFranchises: franchises.length,
      totalOrders,
      totalSuppliedValue,
      totalWeightTonnes,
      totalOutstandingCredit,
      inTransitOrders,
    };
  }, [franchises, orders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchFranchise = selectedFranchiseFilter === 'ALL' || o.franchiseId === selectedFranchiseFilter;
      const matchStatus = selectedStatusFilter === 'ALL' || o.fulfillmentStatus === selectedStatusFilter;
      const matchQuery =
        !searchQuery.trim() ||
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.franchiseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.itemsSummary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.poNumber.toLowerCase().includes(searchQuery.toLowerCase());

      return matchFranchise && matchStatus && matchQuery;
    });
  }, [orders, selectedFranchiseFilter, selectedStatusFilter, searchQuery]);

  const handleCreateOrder = async () => {
    const values = await createForm.validateFields();
    const targetFranchise = franchises.find((f) => f.id === values.franchiseId);
    if (!targetFranchise) return;

    const subtotal = Number(values.approxAmount || 85000);
    const taxTotal = Math.round(subtotal * 0.05);
    const totalAmount = subtotal + taxTotal;
    const totalWeightKg = Number(values.weightKg || 1500);

    const newOrder: FranchiseSupplyOrder = {
      id: `fr-ord-${Date.now()}`,
      orderNumber: `FR-SUP-${dayjs().format('YYYYMMDD')}-${Math.floor(10 + Math.random() * 90)}`,
      poNumber: values.poNumber || `PO-${targetFranchise.city.toUpperCase().slice(0, 3)}-${Math.floor(1000 + Math.random() * 9000)}`,
      franchiseId: targetFranchise.id,
      franchiseName: targetFranchise.name,
      franchiseCode: targetFranchise.code,
      partnerName: targetFranchise.partnerName,
      phone: targetFranchise.phone,
      city: targetFranchise.city,
      state: targetFranchise.state,
      orderDate: dayjs().format('DD MMM YYYY, HH:mm A'),
      dispatchDate: dayjs().format('DD MMM YYYY, HH:mm A'),
      assignedWarehouse: values.warehouseName || 'Patna Central Silo & Processing Hub',
      itemsSummary: values.itemsSummary || 'Bulk Chakki Atta, Pulses & Ghee replenishment dispatch',
      totalItemUnits: Number(values.itemUnits || 180),
      totalWeightKg,
      subtotal,
      taxTotal,
      totalAmount,
      paymentTerms: values.paymentTerms || 'CREDIT_15D',
      paymentStatus: 'UNPAID',
      fulfillmentStatus: 'DISPATCHED',
      freightPartner: values.freightPartner || 'SVV Express Logistics',
      truckNumber: values.truckNumber || 'BR-01-GB-9921',
      driverPhone: values.driverPhone || '9835123888',
      notes: values.notes || 'Bulk stock allocated and dispatched to franchise partner store.',
      items: [
        {
          id: 'it-new-1',
          productName: 'Shree Vighnaharta Chakki Atta (10 KG)',
          sku: 'FG-ATT-10KG',
          packSize: '10 KG Bag',
          quantity: 100,
          unitPrice: 420,
          lineTotal: 42000,
          weightKg: 1000,
        },
        {
          id: 'it-new-2',
          productName: 'Pure Kachi Ghani Mustard Oil (1 Litre)',
          sku: 'FG-OIL-01L',
          packSize: '1 L Bottle',
          quantity: 50,
          unitPrice: 165,
          lineTotal: 8250,
          weightKg: 500,
        },
      ],
    };

    const updatedOrders = [newOrder, ...orders];
    const updatedFranchises = franchises.map((f) =>
      f.id === targetFranchise.id
        ? {
            ...f,
            totalOrdersCount: f.totalOrdersCount + 1,
            totalVolumeTonnes: Number((f.totalVolumeTonnes + totalWeightKg / 1000).toFixed(1)),
            totalSuppliedAmount: f.totalSuppliedAmount + totalAmount,
            outstandingBalance: f.outstandingBalance + totalAmount,
          }
        : f,
    );

    setOrders(updatedOrders);
    setFranchises(updatedFranchises);
    saveStoredFranchiseOrders(updatedOrders);
    saveStoredFranchises(updatedFranchises);

    message.success(`Franchise supply order ${newOrder.orderNumber} dispatched to ${targetFranchise.name}!`);
    createForm.resetFields();
    setCreateModalOpen(false);
  };

  // Table Columns
  const columns: ColumnsType<FranchiseSupplyOrder> = [
    {
      title: 'Supply Order ID',
      key: 'order',
      width: 190,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <a
            onClick={() => navigate(`/franchise-orders/${record.id}`)}
            style={{ fontSize: 13, fontWeight: 700, color: '#096dd9', cursor: 'pointer' }}
          >
            {record.orderNumber}
          </a>
          <Text type="secondary" style={{ fontSize: 11 }}>
            PO: <span style={{ fontFamily: 'monospace' }}>{record.poNumber}</span>
          </Text>
        </Space>
      ),
    },
    {
      title: 'Franchise Partner & Store',
      key: 'franchise',
      width: 260,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13 }}>{record.franchiseName}</Text>
          <Space size={4}>
            <Tag color="geekblue" style={{ fontSize: 10 }}>{record.franchiseCode}</Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>📍 {record.city}, {record.state}</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 11 }}>👤 {record.partnerName} · 📱 +91 {record.phone}</Text>
        </Space>
      ),
    },
    {
      title: 'Stock Supplied Summary',
      key: 'items',
      render: (_, record) => (
        <div>
          <Text style={{ fontSize: 12 }}>{record.itemsSummary}</Text>
          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Tag color="blue" style={{ fontSize: 10 }}>{record.totalItemUnits} Units</Tag>
            <Tag color="cyan" style={{ fontSize: 10 }}>⚖️ {(record.totalWeightKg / 1000).toFixed(2)} Tonnes</Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Invoice Value',
      key: 'amount',
      align: 'right',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={0} style={{ width: '100%', textAlign: 'right' }}>
          <Text strong style={{ fontSize: 14, color: '#389e0d' }}>
            {formatCurrency(record.totalAmount)}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            GST (5%): {formatCurrency(record.taxTotal)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Payment Terms',
      key: 'payment',
      width: 130,
      render: (_, record) => {
        let color = 'default';
        if (record.paymentStatus === 'PAID') color = 'success';
        else if (record.paymentStatus === 'OVERDUE') color = 'error';
        else if (record.paymentStatus === 'UNPAID') color = 'warning';

        return (
          <Space direction="vertical" size={2}>
            <Tag color={color} style={{ fontWeight: 600 }}>{record.paymentStatus}</Tag>
            <Text type="secondary" style={{ fontSize: 10 }}>{record.paymentTerms.replace('_', ' ')}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Fulfillment',
      dataIndex: 'fulfillmentStatus',
      key: 'status',
      width: 130,
      render: (status: string) => {
        if (status === 'DELIVERED') return <Tag color="green" icon={<CheckCircleOutlined />}>DELIVERED</Tag>;
        if (status === 'IN_TRANSIT') return <Tag color="blue" icon={<CarOutlined />}>IN TRANSIT</Tag>;
        if (status === 'DISPATCHED') return <Tag color="processing" icon={<TruckOutlined />}>DISPATCHED</Tag>;
        return <Tag color="default">{status}</Tag>;
      },
    },
    {
      title: 'Freight Partner',
      key: 'freight',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Space size={4}>
            <TruckOutlined style={{ color: '#52c41a', fontSize: 12 }} />
            <Text style={{ fontSize: 11 }}>{record.freightPartner}</Text>
          </Space>
          <Tag color="geekblue" style={{ fontSize: 10 }}>{record.truckNumber}</Tag>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={6}>
          <Button
            size="small"
            type="primary"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/franchise-orders/${record.id}`)}
            style={{ background: '#1677ff' }}
          >
            Logs
          </Button>
          <Tooltip title="Download GST Supply Bill">
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={() =>
                downloadOrderBill({
                  orderNumber: record.orderNumber,
                  orderDate: record.orderDate,
                  customerName: `${record.franchiseName} (${record.partnerName})`,
                  channel: 'B2B_FRANCHISE',
                  total: record.totalAmount,
                  taxTotal: record.taxTotal,
                  subtotal: record.subtotal,
                  paymentStatus: record.paymentStatus,
                  paymentMethod: record.paymentTerms,
                  items: record.items.map((i) => ({
                    id: i.id,
                    product: { name: i.productName },
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    lineTotal: i.lineTotal,
                  })),
                })
              }
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
      {/* Page Header */}
      <PageHeader
        title="Super Admin Franchise Supply & Order Distribution Center"
        subtitle="Centralized dispatch logs & ledger: View which franchise partner store received how much bulk stock, fulfillment timelines, freight tracking, and credit terms."
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
            style={{ background: '#059669', borderColor: '#059669' }}
          >
            Dispatch Franchise Supply Order
          </Button>
        }
      />

      {/* KPI Aggregate Cards */}
      <Row gutter={[14, 14]}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, borderTop: '4px solid #1677ff' }}>
            <Statistic
              title={
                <Space>
                  <ShopOutlined style={{ color: '#1677ff' }} />
                  <span style={{ fontWeight: 600 }}>Active Franchise Stores</span>
                </Space>
              }
              value={stats.totalFranchises}
              suffix="Stores"
              valueStyle={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              Bihar, Jharkhand &amp; MP Network
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, borderTop: '4px solid #52c41a' }}>
            <Statistic
              title={
                <Space>
                  <TruckOutlined style={{ color: '#52c41a' }} />
                  <span style={{ fontWeight: 600 }}>Total Bulk Supplies Dispatched</span>
                </Space>
              }
              value={stats.totalOrders}
              suffix="Orders"
              valueStyle={{ fontSize: 24, fontWeight: 800, color: '#52c41a' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#059669', fontWeight: 600 }}>
              🚚 {stats.inTransitOrders} Shipments In-Transit Right Now
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, borderTop: '4px solid #722ed1' }}>
            <Statistic
              title={
                <Space>
                  <InboxOutlined style={{ color: '#722ed1' }} />
                  <span style={{ fontWeight: 600 }}>Total Stock Volume Delivered</span>
                </Space>
              }
              value={stats.totalWeightTonnes}
              suffix="Tonnes"
              valueStyle={{ fontSize: 24, fontWeight: 800, color: '#722ed1' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              Chakki Atta, Cold-Pressed Oils, Grains &amp; Ghee
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, borderTop: '4px solid #faad14' }}>
            <Statistic
              title={
                <Space>
                  <DollarOutlined style={{ color: '#faad14' }} />
                  <span style={{ fontWeight: 600 }}>Total Supply Value (Gross)</span>
                </Space>
              }
              value={stats.totalSuppliedValue}
              prefix="₹"
              valueStyle={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>
              Pending Credit: {formatCurrency(stats.totalOutstandingCredit)}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Franchise Store Directory Cards */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space>
              <TeamOutlined style={{ color: '#1677ff' }} />
              <span>Partner Franchise Network &amp; Stock Delivery Summary</span>
            </Space>
            <Tag color="blue">{franchises.length} Franchise Hubs</Tag>
          </div>
        }
        style={{ borderRadius: 10 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {franchises.map((f) => (
            <div
              key={f.id}
              onClick={() => setSelectedFranchiseFilter(f.id === selectedFranchiseFilter ? 'ALL' : f.id)}
              style={{
                border: f.id === selectedFranchiseFilter ? '2px solid #1677ff' : '1px solid #e2e8f0',
                background: f.id === selectedFranchiseFilter ? '#f0f5ff' : '#f8fafc',
                borderRadius: 8,
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text strong style={{ fontSize: 13, color: '#1e293b' }}>{f.name}</Text>
                <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>{f.code}</Tag>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                👤 {f.partnerName} · 📱 +91 {f.phone}
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span>Orders Supplied: <strong>{f.totalOrdersCount}</strong></span>
                <span>Volume: <strong>{f.totalVolumeTonnes} T</strong></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}>
                <span>Total Value: <strong style={{ color: '#059669' }}>{formatCurrency(f.totalSuppliedAmount)}</strong></span>
                <span>Credit: <strong style={{ color: f.outstandingBalance > 50000 ? '#ef4444' : '#d97706' }}>{formatCurrency(f.outstandingBalance)}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Main Order Logs Table */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Space>
              <FileTextOutlined style={{ color: '#1677ff' }} />
              <span>Franchise Supply Order Logs &amp; Shipments</span>
            </Space>
            <Tag color="blue">{filteredOrders.length} Supply Orders Recorded</Tag>
          </div>
        }
        style={{ borderRadius: 10 }}
      >
        {/* Filters */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }} align="middle">
          <Col xs={24} sm={10} md={8}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search Supply Order No, Franchise, City, Products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </Col>

          <Col xs={12} sm={7} md={5}>
            <Select
              value={selectedFranchiseFilter}
              onChange={setSelectedFranchiseFilter}
              style={{ width: '100%' }}
              options={[
                { value: 'ALL', label: '🏬 All Franchise Stores' },
                ...franchises.map((f) => ({ value: f.id, label: `${f.city}: ${f.name}` })),
              ]}
            />
          </Col>

          <Col xs={12} sm={7} md={5}>
            <Select
              value={selectedStatusFilter}
              onChange={setSelectedStatusFilter}
              style={{ width: '100%' }}
              options={[
                { value: 'ALL', label: '🚚 All Shipment Statuses' },
                { value: 'DELIVERED', label: 'Delivered' },
                { value: 'IN_TRANSIT', label: 'In-Transit' },
                { value: 'DISPATCHED', label: 'Dispatched' },
              ]}
            />
          </Col>

          <Col xs={24} md={6} style={{ textAlign: 'right' }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSelectedFranchiseFilter('ALL');
                setSelectedStatusFilter('ALL');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </Button>
          </Col>
        </Row>

        <Table
          dataSource={filteredOrders}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>

      {/* Dispatch New Franchise Supply Order Modal */}
      <Modal
        title="Dispatch New Bulk Stock to Franchise Store"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateOrder}
        okText="Dispatch Stock"
        width={600}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="franchiseId"
            label="Select Franchise Store Destination"
            rules={[{ required: true, message: 'Please select franchise' }]}
          >
            <Select
              placeholder="Select target franchise store"
              options={franchises.map((f) => ({
                value: f.id,
                label: `${f.code} — ${f.name} (${f.city})`,
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="poNumber" label="Franchise PO Number">
                <Input placeholder="e.g. PO-PAT-9912" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="warehouseName" label="Fulfillment Sourcing Depot" initialValue="Patna Central Silo & Processing Hub">
                <Select
                  options={[
                    { value: 'Patna Central Silo & Processing Hub', label: 'Patna Central Silo Hub' },
                    { value: 'Ranchi Regional Distribution Hub', label: 'Ranchi Regional Hub' },
                    { value: 'Indore Mandi Processing Hub', label: 'Indore Processing Hub' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="itemsSummary"
            label="Stock Supplied Description / Particulars"
            rules={[{ required: true, message: 'Please enter items description' }]}
            initialValue="Chakki Atta 10kg x 100 bags, Mustard Oil 1L x 50 boxes, Toor Dal 1kg x 80 bags"
          >
            <Input.TextArea rows={2} placeholder="e.g. Chakki Atta 10kg x 200 bags, Mustard Oil 1L x 100 boxes" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="itemUnits" label="Total Units" initialValue={230}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="weightKg" label="Total Weight (KG)" initialValue={2000}>
                <InputNumber min={1} style={{ width: '100%' }} suffix="kg" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="approxAmount" label="Subtotal Value (₹)" initialValue={95000} rules={[{ required: true }]}>
                <InputNumber min={1} prefix="₹" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="paymentTerms" label="Credit & Payment Terms" initialValue="CREDIT_15D">
                <Select
                  options={[
                    { value: 'PREPAID', label: 'Prepaid Advance' },
                    { value: 'CREDIT_15D', label: '15-Day Net Credit' },
                    { value: 'CREDIT_30D', label: '30-Day Net Credit' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="freightPartner" label="Logistics Freight Partner" initialValue="SVV Express Fleet">
                <Input placeholder="e.g. SVV Express Fleet" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="truckNumber" label="Carrier Vehicle / Truck No." initialValue="BR-01-GB-4421">
                <Input placeholder="e.g. BR-01-GB-4421" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="driverPhone" label="Driver Mobile Number" initialValue="9835123999">
                <Input placeholder="e.g. 9835123999" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Space>
  );
}
