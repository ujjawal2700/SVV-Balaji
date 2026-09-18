import {
  ArrowLeftOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  PhoneOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  ShopOutlined,
  SyncOutlined,
  TruckOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Breadcrumb,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Progress,
  Result,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency } from '../../utils/format';
import { downloadOrderBill } from '../../utils/invoiceGenerator';
import {
  FranchiseStore,
  FranchiseSupplyOrder,
  getStoredFranchiseOrders,
  getStoredFranchises,
  saveStoredFranchiseOrders,
} from './franchiseData';

const { Text, Title, Paragraph } = Typography;

export function FranchiseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();

  const [orders, setOrders] = useState<FranchiseSupplyOrder[]>([]);
  const [franchises, setFranchises] = useState<FranchiseStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOrders(getStoredFranchiseOrders());
    setFranchises(getStoredFranchises());
    setLoading(false);
  }, []);

  const order = useMemo(() => {
    if (!id) return null;
    return (
      orders.find((o) => o.id === id || o.orderNumber.toLowerCase() === id.toLowerCase()) || null
    );
  }, [orders, id]);

  const franchise = useMemo(() => {
    if (!order) return null;
    return franchises.find((f) => f.id === order.franchiseId) || null;
  }, [franchises, order]);

  const handleUpdateStatus = (nextStatus: FranchiseSupplyOrder['fulfillmentStatus']) => {
    if (!order) return;
    const updatedOrders = orders.map((o) =>
      o.id === order.id
        ? {
            ...o,
            fulfillmentStatus: nextStatus,
            deliveredDate:
              nextStatus === 'DELIVERED'
                ? dayjs().format('DD MMM YYYY, HH:mm A')
                : o.deliveredDate,
          }
        : o,
    );
    setOrders(updatedOrders);
    saveStoredFranchiseOrders(updatedOrders);
    message.success(`Franchise order status updated to ${nextStatus}`);
  };

  const handleUpdatePayment = (nextPayment: FranchiseSupplyOrder['paymentStatus']) => {
    if (!order) return;
    const updatedOrders = orders.map((o) =>
      o.id === order.id ? { ...o, paymentStatus: nextPayment } : o,
    );
    setOrders(updatedOrders);
    saveStoredFranchiseOrders(updatedOrders);
    message.success(`Payment status updated to ${nextPayment}`);
  };

  if (loading) {
    return null;
  }

  if (!order) {
    return (
      <Card style={{ margin: 24, borderRadius: 12, textAlign: 'center' }}>
        <Result
          status="404"
          title="Franchise Order Not Found"
          subTitle={`No franchise supply log found matching order identifier "${id}".`}
          extra={
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/franchise-orders')}
            >
              Back to Franchise Order Logs
            </Button>
          }
        />
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return 'success';
      case 'IN_TRANSIT':
        return 'processing';
      case 'DISPATCHED':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Top Breadcrumbs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Breadcrumb
          items={[
            {
              title: (
                <span
                  style={{ cursor: 'pointer', color: '#1677ff' }}
                  onClick={() => navigate('/franchise-orders')}
                >
                  🏬 Franchise Supply Orders
                </span>
              ),
            },
            {
              title: <span>Order Log: {order.orderNumber}</span>,
            },
          ]}
        />
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/franchise-orders')}
          style={{ borderRadius: 6 }}
        >
          Back to All Logs
        </Button>
      </div>

      {/* Main Page Header */}
      <Card
        style={{
          borderRadius: 12,
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 60%, #eff6ff 100%)',
          border: '1px solid #bbf7d0',
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={14}>
            <Space direction="vertical" size={4}>
              <Space size={8} wrap>
                <Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                  {order.orderNumber}
                </Title>
                <Tag color="geekblue" style={{ fontSize: 12, padding: '2px 8px' }}>
                  PO: {order.poNumber}
                </Tag>
                <Tag
                  color={getStatusColor(order.fulfillmentStatus)}
                  style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px' }}
                >
                  {order.fulfillmentStatus}
                </Tag>
                <Tag
                  color={
                    order.paymentStatus === 'PAID'
                      ? 'green'
                      : order.paymentStatus === 'OVERDUE'
                      ? 'red'
                      : 'orange'
                  }
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  PAYMENT: {order.paymentStatus}
                </Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Dispatched to: <strong>{order.franchiseName}</strong> ({order.city}, {order.state}) · Ordered on: {order.orderDate}
              </Text>
            </Space>
          </Col>

          <Col xs={24} md={10} style={{ textAlign: 'right' }}>
            <Space size={8} wrap style={{ justifyContent: 'flex-end' }}>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                size="large"
                onClick={() =>
                  downloadOrderBill({
                    orderNumber: order.orderNumber,
                    orderDate: order.orderDate,
                    customerName: `${order.franchiseName} (${order.partnerName})`,
                    channel: 'B2B_FRANCHISE',
                    total: order.totalAmount,
                    taxTotal: order.taxTotal,
                    subtotal: order.subtotal,
                    paymentStatus: order.paymentStatus,
                    paymentMethod: order.paymentTerms,
                    items: order.items.map((i) => ({
                      id: i.id,
                      product: { name: i.productName },
                      quantity: i.quantity,
                      unitPrice: i.unitPrice,
                      lineTotal: i.lineTotal,
                    })),
                  })
                }
                style={{
                  background: '#059669',
                  borderColor: '#059669',
                  fontWeight: 600,
                  borderRadius: 8,
                }}
              >
                Download GST Invoice Bill
              </Button>
              {order.fulfillmentStatus !== 'DELIVERED' && (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  size="large"
                  onClick={() => handleUpdateStatus('DELIVERED')}
                  style={{
                    background: '#1677ff',
                    borderRadius: 8,
                  }}
                >
                  Mark as Delivered
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Fulfillment Status Banner */}
      <Alert
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong>Fulfillment Status: </strong>
              <span style={{ color: order.fulfillmentStatus === 'DELIVERED' ? '#059669' : '#0284c7', fontWeight: 700 }}>
                {order.fulfillmentStatus}
              </span>
              {order.deliveredDate && (
                <span style={{ marginLeft: 12, fontSize: 12, color: '#64748b' }}>
                  (Delivered &amp; Store Verified: {order.deliveredDate})
                </span>
              )}
            </div>
            <Space size={6}>
              <span style={{ fontSize: 12, color: '#475569' }}>Change Logistics Status:</span>
              <Select
                size="small"
                value={order.fulfillmentStatus}
                onChange={handleUpdateStatus}
                style={{ width: 140 }}
                options={[
                  { value: 'DISPATCHED', label: 'Dispatched' },
                  { value: 'IN_TRANSIT', label: 'In-Transit' },
                  { value: 'DELIVERED', label: 'Delivered' },
                  { value: 'ALLOCATED', label: 'Allocated' },
                ]}
              />
            </Space>
          </div>
        }
        type={order.fulfillmentStatus === 'DELIVERED' ? 'success' : 'info'}
        showIcon
        style={{ borderRadius: 8 }}
      />

      {/* Main Grid Details */}
      <Row gutter={[16, 16]}>
        {/* Left Column - Store Metadata, Truck & Manifest */}
        <Col xs={24} lg={16}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Franchise Destination Hub Card */}
            <Card
              title={
                <Space>
                  <ShopOutlined style={{ color: '#1677ff' }} />
                  <span>Franchise Partner &amp; Destination Store</span>
                </Space>
              }
              size="small"
              style={{ borderRadius: 10 }}
            >
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Franchise Name" span={2}>
                  <Text strong style={{ fontSize: 14 }}>{order.franchiseName}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Store Code">
                  <Tag color="cyan">{order.franchiseCode}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Partner / Owner">
                  👤 {order.partnerName}
                </Descriptions.Item>
                <Descriptions.Item label="Phone Contact">
                  <Space>
                    <PhoneOutlined style={{ color: '#1677ff' }} />
                    <a href={`tel:${order.phone}`}>+91 {order.phone}</a>
                    <Button
                      type="link"
                      size="small"
                      icon={<WhatsAppOutlined style={{ color: '#25d366' }} />}
                      href={`https://wa.me/91${order.phone}`}
                      target="_blank"
                    >
                      WhatsApp
                    </Button>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Destination City">
                  📍 {order.city}, {order.state}
                </Descriptions.Item>
                {franchise && (
                  <>
                    <Descriptions.Item label="Store Address" span={2}>
                      <EnvironmentOutlined style={{ color: '#ef4444', marginRight: 4 }} />
                      {franchise.address}
                    </Descriptions.Item>
                    <Descriptions.Item label="GSTIN">
                      <span style={{ fontFamily: 'monospace' }}>{franchise.gstin}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="Store Lifetime Volume">
                      <strong>{franchise.totalVolumeTonnes} Tonnes</strong> ({franchise.totalOrdersCount} supply dispatches)
                    </Descriptions.Item>
                  </>
                )}
              </Descriptions>
            </Card>

            {/* Freight & Logistics Details */}
            <Card
              title={
                <Space>
                  <TruckOutlined style={{ color: '#52c41a' }} />
                  <span>Logistics, Dispatch Sourcing Depot &amp; Freight Tracking</span>
                </Space>
              }
              size="small"
              style={{ borderRadius: 10 }}
            >
              <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                <Descriptions.Item label="Sourcing Depot Silo">
                  🏬 {order.assignedWarehouse}
                </Descriptions.Item>
                <Descriptions.Item label="Carrier Logistics Partner">
                  🚚 <strong>{order.freightPartner}</strong>
                </Descriptions.Item>
                <Descriptions.Item label="Truck / Vehicle No.">
                  <Tag color="geekblue" style={{ fontSize: 12, fontWeight: 700 }}>
                    {order.truckNumber}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Driver Contact">
                  <Space>
                    <PhoneOutlined style={{ color: '#52c41a' }} />
                    <a href={`tel:${order.driverPhone}`}>+91 {order.driverPhone}</a>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Dispatched On">
                  🕒 {order.dispatchDate}
                </Descriptions.Item>
                <Descriptions.Item label="Total Consignment Weight">
                  <Tag color="purple" style={{ fontSize: 12, fontWeight: 600 }}>
                    {(order.totalWeightKg / 1000).toFixed(2)} Tonnes ({order.totalWeightKg} kg)
                  </Tag>
                </Descriptions.Item>
              </Descriptions>

              {order.notes && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <strong>Dispatch Notes:</strong> {order.notes}
                  </Text>
                </div>
              )}
            </Card>

            {/* Itemized Stock Supplied Table */}
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <InboxOutlined style={{ color: '#722ed1' }} />
                    <span>Itemized Stock Supplied Manifest ({order.items.length} Products)</span>
                  </Space>
                  <Tag color="blue">{order.totalItemUnits} Total Units</Tag>
                </div>
              }
              size="small"
              style={{ borderRadius: 10 }}
            >
              <Table
                dataSource={order.items}
                rowKey="id"
                pagination={false}
                size="middle"
                columns={[
                  {
                    title: 'Product Description & SKU',
                    key: 'product',
                    render: (_, item) => (
                      <div>
                        <Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                          {item.productName}
                        </Text>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          SKU: <span style={{ fontFamily: 'monospace' }}>{item.sku}</span> · Pack: <strong>{item.packSize}</strong>
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: 'Qty (Bags/Units)',
                    dataIndex: 'quantity',
                    align: 'right',
                    width: 130,
                    render: (q) => (
                      <Text strong style={{ fontSize: 14, color: '#096dd9' }}>
                        {q} units
                      </Text>
                    ),
                  },
                  {
                    title: 'Unit Rate (₹)',
                    dataIndex: 'unitPrice',
                    align: 'right',
                    width: 120,
                    render: (p) => formatCurrency(p),
                  },
                  {
                    title: 'Line Weight',
                    dataIndex: 'weightKg',
                    align: 'right',
                    width: 120,
                    render: (w) => <Tag color="cyan">{w} kg</Tag>,
                  },
                  {
                    title: 'Gross Amount (₹)',
                    dataIndex: 'lineTotal',
                    align: 'right',
                    width: 140,
                    render: (t) => (
                      <Text strong style={{ fontSize: 14, color: '#059669' }}>
                        {formatCurrency(t)}
                      </Text>
                    ),
                  },
                ]}
              />

              <div
                style={{
                  marginTop: 12,
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Summary: {order.itemsSummary}
                </Text>
                <Space size={16}>
                  <Text>Total Units: <strong>{order.totalItemUnits}</strong></Text>
                  <Text>Total Weight: <strong>{(order.totalWeightKg / 1000).toFixed(2)} Tonnes</strong></Text>
                </Space>
              </div>
            </Card>
          </Space>
        </Col>

        {/* Right Column - Financials, Credit, Status Updates */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Invoice & Financials Card */}
            <Card
              title={
                <Space>
                  <DollarOutlined style={{ color: '#059669' }} />
                  <span>Invoice &amp; Payment Ledger</span>
                </Space>
              }
              size="small"
              style={{ borderRadius: 10 }}
            >
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text type="secondary">Goods Subtotal</Text>
                  <Text strong>{formatCurrency(order.subtotal)}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text type="secondary">GST Tax (5% CGST+SGST)</Text>
                  <Text>{formatCurrency(order.taxTotal)}</Text>
                </div>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong style={{ fontSize: 15 }}>Net Invoiced Value</Text>
                  <Text strong style={{ fontSize: 18, color: '#059669' }}>
                    {formatCurrency(order.totalAmount)}
                  </Text>
                </div>
              </div>

              <Divider style={{ margin: '12px 0' }} />

              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="Payment Status">
                  <Tag
                    color={
                      order.paymentStatus === 'PAID'
                        ? 'green'
                        : order.paymentStatus === 'OVERDUE'
                        ? 'red'
                        : 'orange'
                    }
                    style={{ fontWeight: 700 }}
                  >
                    {order.paymentStatus}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Credit Terms">
                  {order.paymentTerms.replace('_', ' ')}
                </Descriptions.Item>
              </Descriptions>

              <div style={{ marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                  Update Payment Status:
                </Text>
                <Select
                  value={order.paymentStatus}
                  onChange={handleUpdatePayment}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'PAID', label: '✅ PAID (Full Settlement)' },
                    { value: 'UNPAID', label: '⏳ UNPAID (Within Credit Period)' },
                    { value: 'PARTIAL', label: '⚠️ PARTIAL (Partially Settled)' },
                    { value: 'OVERDUE', label: '🚨 OVERDUE (Credit Exceeded)' },
                  ]}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <Button
                  block
                  icon={<DownloadOutlined />}
                  onClick={() =>
                    downloadOrderBill({
                      orderNumber: order.orderNumber,
                      orderDate: order.orderDate,
                      customerName: `${order.franchiseName} (${order.partnerName})`,
                      channel: 'B2B_FRANCHISE',
                      total: order.totalAmount,
                      taxTotal: order.taxTotal,
                      subtotal: order.subtotal,
                      paymentStatus: order.paymentStatus,
                      paymentMethod: order.paymentTerms,
                      items: order.items.map((i) => ({
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
                  Download GST Invoice (PDF/HTML)
                </Button>
              </div>
            </Card>

            {/* Franchise Credit Limit & Ledger */}
            {franchise && (
              <Card
                title={
                  <Space>
                    <ShopOutlined style={{ color: '#faad14' }} />
                    <span>Store Credit Standing</span>
                  </Space>
                }
                size="small"
                style={{ borderRadius: 10 }}
              >
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>Assigned Credit Limit:</span>
                    <strong>{formatCurrency(franchise.creditLimit)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>Current Outstanding:</span>
                    <strong style={{ color: franchise.outstandingBalance > 50000 ? '#ef4444' : '#d97706' }}>
                      {formatCurrency(franchise.outstandingBalance)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>Available Credit Buffer:</span>
                    <strong style={{ color: '#059669' }}>
                      {formatCurrency(Math.max(0, franchise.creditLimit - franchise.outstandingBalance))}
                    </strong>
                  </div>
                </div>

                <Progress
                  percent={Math.min(
                    100,
                    Math.round((franchise.outstandingBalance / franchise.creditLimit) * 100),
                  )}
                  status={franchise.outstandingBalance > franchise.creditLimit * 0.8 ? 'exception' : 'active'}
                  strokeColor={franchise.outstandingBalance > franchise.creditLimit * 0.8 ? '#ef4444' : '#10b981'}
                />
              </Card>
            )}

            {/* Verification QR Provenance */}
            <Card
              title={
                <Space>
                  <QrcodeOutlined style={{ color: '#1677ff' }} />
                  <span>Batch Provenance &amp; Verification</span>
                </Space>
              }
              size="small"
              style={{ borderRadius: 10 }}
            >
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div
                  style={{
                    display: 'inline-block',
                    padding: 12,
                    background: '#f1f5f9',
                    borderRadius: 8,
                    border: '1px dashed #94a3b8',
                  }}
                >
                  <QrcodeOutlined style={{ fontSize: 56, color: '#334155' }} />
                  <div style={{ fontSize: 10, fontFamily: 'monospace', marginTop: 4, color: '#64748b' }}>
                    {order.orderNumber}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                  Scan code at franchise intake dock for automated receipt verification and POS stock increment.
                </div>
              </div>
            </Card>
          </Space>
        </Col>
      </Row>
    </Space>
  );
}
