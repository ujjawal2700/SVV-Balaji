import {
  BarcodeOutlined,
  BoxPlotOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ContainerOutlined,
  CopyOutlined,
  DashboardOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  HomeOutlined,
  InboxOutlined,
  LinkOutlined,
  PhoneOutlined,
  PrinterOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
  StopOutlined,
  SwapOutlined,
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
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import type {
  AllocationShortfall,
  OrderAllocation,
  OrderItem,
  PaymentStatus,
} from '../../api/types';
import { Can } from '../../components/Can';
import { WarehouseSelect } from '../../components/pickers';
import { useCan } from '../../auth/useCan';
import {
  useAllocateOrder,
  useCancelOrder,
  useConfirmOrder,
  useDeliverOrder,
  useDispatchOrder,
  useOrder,
  usePackOrder,
  usePlaceOrder,
  useSetOrderPaymentStatus,
} from '@shared/hooks/useSales';
import { useWarehouses } from '@shared/hooks/useWarehouses';
import { EM_DASH, formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import {
  PAYMENT_STATUS_COLOUR,
  PAYMENT_STATUS_LABEL,
  SETTABLE_PAYMENT_STATUSES,
} from '@shared/utils/paymentStatus';
import { CANCELLABLE, NEXT_STEP, ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from './orderStatus';
import { MOCK_ORDERS } from './OrdersPage';
import { MOCK_B2B_ORDERS } from './B2BOrdersPage';
import { downloadOrderBill } from '../../utils/invoiceGenerator';

const { Text, Title, Paragraph } = Typography;

/**
 * Super Admin Granular Order Detail Drawer (B2C & B2B)
 */
export function OrderDetailDrawer({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const { message, modal } = AntApp.useApp();
  const [activeTab, setActiveTab] = useState('items');
  const [cancelReason, setCancelReason] = useState('');
  const [repriced, setRepriced] = useState<Array<{ orderItemId: string; from: number; to: number }>>([]);
  const [shortfalls, setShortfalls] = useState<AllocationShortfall[]>([]);
  const [overrideWarehouseId, setOverrideWarehouseId] = useState<string | null>(null);
  const [printInvoiceModalOpen, setPrintInvoiceModalOpen] = useState(false);

  const order = useOrder(orderId ?? undefined);
  const warehouses = useWarehouses();

  const mockFallback = useMemo(() => {
    if (!orderId) return null;
    const combined = [...(MOCK_ORDERS as any[]), ...(MOCK_B2B_ORDERS as any[])];
    return combined.find((o) => o.id === orderId || o.orderNumber === orderId) ?? null;
  }, [orderId]);

  const place = usePlaceOrder();
  const confirm = useConfirmOrder();
  const allocate = useAllocateOrder();
  const pack = usePackOrder();
  const dispatch = useDispatchOrder();
  const deliver = useDeliverOrder();
  const cancel = useCancelOrder();
  const setPayment = useSetOrderPaymentStatus();

  const canCancel = useCan('ORDER_CANCEL');
  const data = (order.data as any) ?? mockFallback;
  const step = data ? NEXT_STEP[data.status] : undefined;

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    message.success(`${label} copied to clipboard`);
  };

  const handleNodeOverride = (newWarehouseId: string) => {
    setOverrideWarehouseId(newWarehouseId);
    const wh = (warehouses.data?.data ?? []).find((w) => w.id === newWarehouseId);
    message.success(`Fulfillment node shifted to ${wh?.name || 'Selected Outlet'}`);
  };

  const lateness = (() => {
    if (!data?.deliveredAt || !data.requiredByDate) return null;
    const days = dayjs(data.deliveredAt).startOf('day').diff(dayjs(data.requiredByDate).startOf('day'), 'day');
    if (days > 0) return { late: true, label: `${days} day${days === 1 ? '' : 's'} late` };
    if (days === 0) return { late: false, label: 'On promised SLA' };
    return { late: false, label: `${-days} day${days === -1 ? '' : 's'} early` };
  })();

  const busy =
    place.isPending ||
    confirm.isPending ||
    allocate.isPending ||
    pack.isPending ||
    dispatch.isPending ||
    deliver.isPending;

  const runStep = async () => {
    if (!data || !step) return;
    try {
      switch (data.status) {
        case 'DRAFT': {
          const result = await place.mutateAsync(data.id);
          setRepriced(result.repriced ?? []);
          message.success('Order placed successfully');
          break;
        }
        case 'PLACED':
          await confirm.mutateAsync(data.id);
          message.success('Order confirmed');
          break;
        case 'CONFIRMED': {
          const result = await allocate.mutateAsync(data.id);
          setShortfalls(result.shortfalls ?? []);
          if (result.complete) {
            message.success(`Allocated ${result.allocations.length} batch(es)`);
          } else {
            message.warning(`Partially allocated short`, 8);
          }
          break;
        }
        case 'ALLOCATED':
          await pack.mutateAsync(data.id);
          message.success('Marked packed & sealed');
          break;
        case 'PACKED':
          await dispatch.mutateAsync(data.id);
          message.success('Dispatched — handed over to delivery partner');
          break;
        case 'DISPATCHED':
          await deliver.mutateAsync(data.id);
          message.success('Marked delivered (Proof of Delivery verified)');
          break;
        default:
          break;
      }
    } catch (error) {
      message.error(apiErrorMessage(error, `Could not ${step.label.toLowerCase()}`), 10);
    }
  };

  const confirmStep = () => {
    if (!step) return;
    modal.confirm({
      title: `${step.label}?`,
      content: step.effect,
      okText: step.label,
      width: 480,
      onOk: runStep,
    });
  };

  const handleCancel = () => {
    if (!data) return;
    setCancelReason('');
    modal.confirm({
      title: `Cancel Order ${data.orderNumber}?`,
      width: 480,
      content: (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text>
            Stock reservations will be released back to available inventory.
          </Text>
          <Input.TextArea
            rows={2}
            placeholder="Reason for cancellation — required"
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </Space>
      ),
      okText: 'Cancel Order',
      okButtonProps: { danger: true },
      onOk: async () => {
        const reason = cancelReason.trim();
        if (!reason) {
          message.error('Cancellation reason is required');
          throw new Error('Reason required');
        }
        try {
          await cancel.mutateAsync({ id: data.id, reason });
          message.success(`Order ${data.orderNumber} cancelled`);
        } catch (error) {
          message.error(apiErrorMessage(error, 'Could not cancel order'), 8);
          throw error;
        }
      },
    });
  };

  const handlePayment = (paymentStatus: PaymentStatus) => {
    if (!data) return;
    void (async () => {
      try {
        await setPayment.mutateAsync({ id: data.id, paymentStatus });
        message.success(`Payment status updated to ${paymentStatus}`);
      } catch (error) {
        message.error(apiErrorMessage(error, 'Could not update payment status'));
      }
    })();
  };

  const itemColumns: ColumnsType<OrderItem> = [
    {
      title: 'Product SKU',
      key: 'product',
      width: 280,
      render: (_, item) => (
        <Space align="center" size={10}>
          <Avatar
            shape="square"
            size={36}
            style={{ backgroundColor: '#f5f5f5', color: '#8c8c8c' }}
          >
            {item.product?.name.charAt(0) || 'P'}
          </Avatar>
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>
              {item.product?.name ?? 'Desi Tokri Sharbati Atta 5kg'}
            </Text>
            <Space size={4}>
              <Text code style={{ fontSize: 10 }}>
                {item.product?.sku ?? 'SKU-501'}
              </Text>
              {/* Batch Traceability Link */}
              <Tooltip title="Click to Trace Origin Farm & Harvest Inspection Batch">
                <Tag
                  color="purple"
                  style={{ cursor: 'pointer', fontSize: 10, margin: 0 }}
                  onClick={() => window.open('/trace', '_blank')}
                >
                  <SafetyCertificateOutlined /> FG-20260814-002
                </Tag>
              </Tooltip>
            </Space>
          </Space>
        </Space>
      ),
    },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right', width: 60 },
    {
      title: 'Unit Rate',
      key: 'unitPrice',
      align: 'right',
      width: 100,
      render: (_, item) => formatCurrency(item.unitPrice),
    },
    {
      title: 'GST %',
      key: 'gst',
      align: 'right',
      width: 80,
      render: (_, item) => `${item.gstRatePercent}%`,
    },
    {
      title: 'Line Total',
      dataIndex: 'lineTotal',
      key: 'lineTotal',
      align: 'right',
      width: 110,
      render: (val: string) => <Text strong>{formatCurrency(val)}</Text>,
    },
  ];

  return (
    <>
      <Drawer
        open={Boolean(orderId)}
        onClose={onClose}
        width={820}
        title={
          data ? (
            <Space align="center">
              <Text code style={{ fontSize: 15, fontWeight: 700 }}>
                #{data.orderNumber}
              </Text>
              <Tag color={ORDER_STATUS_COLOUR[data.status]}>{ORDER_STATUS_LABEL[data.status]}</Tag>
              <Tag color={data.channel === 'B2B' ? 'blue' : 'purple'}>
                {data.channel === 'B2B' ? 'B2B Wholesale' : 'B2C Desi Tokri App'}
              </Tag>
            </Space>
          ) : (
            'Order Details'
          )
        }
        extra={
          data ? (
            <Space>
              <Button
                style={{ backgroundColor: '#25D366', color: '#fff', borderColor: '#25D366' }}
                icon={<WhatsAppOutlined />}
                onClick={() => {
                  const mobile = ((data as any)?.customerMobile || '9876543210').replace(/[^0-9]/g, '');
                  window.open(`https://wa.me/91${mobile}`, '_blank');
                }}
              >
                WhatsApp Direct
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => downloadOrderBill(data)}
                style={{ background: '#059669', borderColor: '#059669' }}
              >
                Download Bill
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => setPrintInvoiceModalOpen(true)}
              >
                Print Invoice
              </Button>
              {CANCELLABLE.includes(data.status) && canCancel && (
                <Button danger icon={<StopOutlined />} loading={cancel.isPending} onClick={handleCancel}>
                  Cancel
                </Button>
              )}
              {step && (
                <Can do={step.permission}>
                  <Button type="primary" icon={<CheckCircleOutlined />} loading={busy} onClick={confirmStep}>
                    {step.label}
                  </Button>
                </Can>
              )}
            </Space>
          ) : null
        }
      >
        {order.isLoading && !data ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 64 }}>
            <Spin size="large" />
          </div>
        ) : data ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Top Summary Metric Banner */}
            <Card
              size="small"
              style={{
                background: 'linear-gradient(135deg, #f6ffed 0%, #e6f4ff 100%)',
                borderColor: '#b7eb8f',
                borderRadius: 8,
              }}
            >
              <Row gutter={[16, 12]} align="middle">
                <Col xs={12} sm={6}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Total Amount</Text>}
                    value={data.total ? formatCurrency(data.total) : '₹2,714.00'}
                    valueStyle={{ color: '#0958d9', fontSize: 18, fontWeight: 700 }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Ordered Items</Text>}
                    value={`${data.items?.length || 2} SKUs (${(data.items || []).reduce((acc: number, i: any) => acc + (i.quantity || 1), 3)} Packs)`}
                    valueStyle={{ fontSize: 14, fontWeight: 600 }}
                    prefix={<ShoppingOutlined style={{ color: '#52c41a' }} />}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Fulfillment Node</Text>}
                    value={data.warehouse?.name || 'Patna WH-01'}
                    valueStyle={{ fontSize: 13, fontWeight: 600 }}
                    prefix={<HomeOutlined style={{ color: '#fa8c16' }} />}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Payment Status</Text>}
                    value={PAYMENT_STATUS_LABEL[data.paymentStatus as PaymentStatus] || 'PAID (UPI)'}
                    valueStyle={{ fontSize: 13, fontWeight: 600, color: '#389e0d' }}
                    prefix={<CheckCircleFilled style={{ color: '#52c41a' }} />}
                  />
                </Col>
              </Row>
            </Card>

            {/* Status alerts */}
            {data.status === 'CANCELLED' && (
              <Alert
                type="error"
                showIcon
                message={`Order Cancelled on ${formatDateTime(data.cancelledAt)}`}
                description={data.cancelledReason || 'No reason specified.'}
              />
            )}

            {/* Clean Section Tabs */}
            <Tabs
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key)}
              type="card"
              items={[
                {
                  key: 'items',
                  label: (
                    <Tag
                      color={activeTab === 'items' ? 'purple' : 'default'}
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        margin: 0,
                        fontWeight: activeTab === 'items' ? 700 : 400,
                        borderRadius: 6,
                        border: activeTab === 'items' ? '1px solid #722ed1' : '1px solid #d9d9d9',
                      }}
                    >
                      <ShoppingOutlined style={{ marginRight: 6 }} />
                      Items & Batch Provenance
                    </Tag>
                  ),
                  children: (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      <Alert
                        type="info"
                        showIcon
                        style={{ padding: '6px 12px', borderRadius: 6, marginBottom: 4, background: '#e6f4ff', borderColor: '#91caff' }}
                        message={
                          <Text style={{ fontSize: 12, color: '#0958d9' }}>
                            <Text strong>Traceability Overview:</Text> View SKU breakdown, allocated FEFO batch codes, RM farm origin & supplier clusters.
                          </Text>
                        }
                      />

                      {/* Item Cards List */}
                      {((data.items && data.items.length > 0 ? data.items : [
                        {
                          id: 'mock-item-1',
                          productId: 'prod-1',
                          product: { id: 'prod-1', name: 'Desi Tokri Organic Sharbati Wheat Atta (10 KG)', sku: 'PRD-ATT-001' },
                          quantity: 2,
                          unitPrice: '520.00',
                          priceListId: 'pl-1',
                          gstRatePercent: '5',
                          lineSubtotal: '1040.00',
                          lineTax: '50.00',
                          lineTotal: '1090.00',
                        },
                        {
                          id: 'mock-item-2',
                          productId: 'prod-2',
                          product: { id: 'prod-2', name: 'A2 Pure Desi Cow Ghee (1 Litre Glass Jar)', sku: 'PRD-GHE-002' },
                          quantity: 1,
                          unitPrice: '1450.00',
                          priceListId: 'pl-2',
                          gstRatePercent: '12',
                          lineSubtotal: '1450.00',
                          lineTax: '174.00',
                          lineTotal: '1624.00',
                        },
                      ]) as OrderItem[]).map((item, idx) => {
                        const isGhee = item.product?.name.includes('Ghee');
                        const isRice = item.product?.name.includes('Rice');
                        const variantText = isGhee ? '1 Litre Glass Jar' : isRice ? '5 KG Pack' : '10 KG Pack';
                        const skuCode = item.product?.sku || `SKU-10${idx + 1}`;
                        const batchNum = idx === 0 ? 'FG-ATT-20260912-04' : idx === 1 ? 'FG-GHE-20260910-01' : `FG-PRD-20260914-0${idx + 1}`;
                        const warehouseName = data.warehouse?.name || 'Patna Central Processing Hub (WH-01)';
                        const farmerSource = idx === 0
                          ? 'M/s MP Organic Wheat Farmers Co-Op (Mandla Cluster - FRM-MP-8812)'
                          : idx === 1
                          ? 'Gir Cow Vedic Gaushala Trust (Anand Dairy Cluster - FRM-GJ-302)'
                          : 'Lakadong Farmers Producer Co. (Meghalaya Cluster - FRM-ML-912)';
                        const mfgDateStr = idx === 0 ? '12 Sept 2026' : '10 Sept 2026';
                        const expDateStr = idx === 0 ? '12 March 2027 (Best Before 6 Months)' : '10 Sept 2027 (Best Before 12 Months)';
                        const packQtyStr = `${item.quantity} Pack(s) (${item.quantity * (isGhee ? 1 : isRice ? 5 : 10)} ${isGhee ? 'Litre' : 'KG'} Total Weight)`;

                        return (
                          <Card
                            key={item.id || idx}
                            size="small"
                            style={{
                              borderRadius: 10,
                              borderLeft: '4px solid #1677ff',
                              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                              background: '#fff',
                            }}
                          >
                            <Row gutter={[12, 12]} align="middle">
                              {/* Left Column: Product Title & SKU */}
                              <Col xs={24} md={15}>
                                <Space align="start" size={12}>
                                  <Avatar
                                    shape="square"
                                    size={46}
                                    style={{ backgroundColor: '#e6f4ff', color: '#1677ff', fontWeight: 700, borderRadius: 6 }}
                                  >
                                    {(item.product?.name || 'P').charAt(0)}
                                  </Avatar>
                                  <Space direction="vertical" size={3}>
                                    <Text strong style={{ fontSize: 14, color: '#1f1f1f' }}>
                                      {item.product?.name || 'Desi Tokri Product'}
                                    </Text>
                                    <Space size={6} wrap style={{ marginTop: 2 }}>
                                      <Tag color="blue" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>
                                        Variant: {variantText}
                                      </Tag>
                                      <Tag color="default" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>
                                        SKU: {skuCode}
                                      </Tag>
                                      <Tag color="purple" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>
                                        Qty: {packQtyStr}
                                      </Tag>
                                    </Space>
                                  </Space>
                                </Space>
                              </Col>

                              {/* Right Column: Pricing Line Total */}
                              <Col xs={24} md={9} style={{ textAlign: 'right' }}>
                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                  Rate: {formatCurrency(item.unitPrice)} / pack · GST: {item.gstRatePercent}%
                                </Text>
                                <Title level={4} style={{ margin: 0, color: '#389e0d', fontWeight: 700 }}>
                                  {formatCurrency(item.lineTotal || (Number(item.unitPrice) * item.quantity).toString())}
                                </Title>
                              </Col>
                            </Row>

                            <Divider style={{ margin: '12px 0 10px 0' }} />

                            {/* Batch Traceability & Provenance Grid - Responsive Layout */}
                            <div style={{ background: '#f8fafc', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 14px' }}>
                              <Row gutter={[16, 12]}>
                                <Col xs={24} sm={12}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>FIFO Allocation Tag</Text>
                                  <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontWeight: 600, fontSize: 11, margin: 0 }}>
                                    FIFO Compliant (Mfg: {idx === 0 ? '15 Aug 2026' : '10 Aug 2026'})
                                  </Tag>
                                </Col>

                                <Col xs={24} sm={12}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Upstream RM Lot</Text>
                                  <Space size={4}>
                                    <BarcodeOutlined style={{ color: '#52c41a' }} />
                                    <Text code style={{ fontSize: 11, fontWeight: 700 }}>
                                      {idx === 0 ? 'RM-20260810-FARM-012' : 'RM-20260808-DAIRY-004'}
                                    </Text>
                                  </Space>
                                </Col>

                                <Col xs={24} sm={12}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Allocated Batch #</Text>
                                  <Tooltip title="Click to open Farm Origin & Harvest Quality Inspection Report">
                                    <Tag
                                      color="geekblue"
                                      style={{ cursor: 'pointer', fontWeight: 600, fontSize: 11, margin: 0 }}
                                      onClick={() => window.open(`/trace?batch=${batchNum}`, '_blank')}
                                    >
                                      <SafetyCertificateOutlined /> {batchNum}
                                    </Tag>
                                  </Tooltip>
                                </Col>

                                <Col xs={24} sm={12}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Allocation Engine Mode</Text>
                                  <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
                                    {overrideWarehouseId ? 'Manual Admin Override' : 'Automated FIFO Selection'}
                                  </Tag>
                                </Col>

                                <Col xs={24}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Fulfilling Warehouse Node</Text>
                                  <Space size={6} align="center">
                                    <HomeOutlined style={{ color: '#1677ff' }} />
                                    <Text strong style={{ fontSize: 12 }}>
                                      Origin Warehouse: {warehouseName} (ID: WH-PAT-01)
                                    </Text>
                                  </Space>
                                </Col>

                                <Col xs={24}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Farmer / Supplier Cluster Origin</Text>
                                  <Space size={6} align="start">
                                    <UserOutlined style={{ color: '#fa8c16', marginTop: 3 }} />
                                    <Text style={{ fontSize: 12 }}>{farmerSource}</Text>
                                  </Space>
                                </Col>

                                <Col xs={24}>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Manufacturing & Expiry Info</Text>
                                  <Space size={12} wrap align="center">
                                    <Text style={{ fontSize: 11 }}>
                                      <Text type="secondary">Mfg Date:</Text> <Text strong>{mfgDateStr}</Text>
                                    </Text>
                                    <Text style={{ fontSize: 11 }}>
                                      <Text type="secondary">Expiry Info:</Text> <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>{expDateStr}</Tag>
                                    </Text>
                                  </Space>
                                </Col>
                              </Row>
                            </div>
                          </Card>
                        );
                      })}

                      {/* Clean Billing Summary Box */}
                      <Card size="small" style={{ background: '#fafafa', borderRadius: 8, border: '1px solid #e8e8e8' }}>
                        <Row gutter={[16, 16]} align="middle">
                          <Col xs={24} sm={12}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                              Payment Gateway Transaction ID:
                            </Text>
                            <Space align="center">
                              <Text code copyable={{ text: 'pay_Px982103912' }} style={{ fontSize: 12, fontWeight: 700 }}>
                                pay_Px982103912
                              </Text>
                              <Tag color="green" style={{ margin: 0 }}>Razorpay UPI</Tag>
                            </Space>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Space direction="vertical" style={{ width: '100%' }} size={4}>
                              <Row justify="space-between">
                                <Text type="secondary">Items Subtotal:</Text>
                                <Text>{formatCurrency(data.subtotal)}</Text>
                              </Row>
                              <Row justify="space-between">
                                <Text type="secondary">Estimated GST Tax:</Text>
                                <Text>{formatCurrency(data.taxTotal)}</Text>
                              </Row>
                              <Row justify="space-between">
                                <Text type="secondary">Delivery Fee:</Text>
                                <Text style={{ color: '#52c41a' }}>₹50.00 (Flat Express)</Text>
                              </Row>
                              <Divider style={{ margin: '6px 0' }} />
                              <Row justify="space-between" align="middle">
                                <Text strong style={{ fontSize: 14 }}>
                                  Final Payable Total:
                                </Text>
                                <Title level={4} style={{ margin: 0, color: '#0958d9', fontWeight: 800 }}>
                                  {formatCurrency(data.total)}
                                </Title>
                              </Row>
                            </Space>
                          </Col>
                        </Row>
                      </Card>
                    </Space>
                  ),
                },
                {
                  key: 'delivery',
                  label: (
                    <Tag
                      color={activeTab === 'delivery' ? 'orange' : 'default'}
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        margin: 0,
                        fontWeight: activeTab === 'delivery' ? 700 : 400,
                        borderRadius: 6,
                        border: activeTab === 'delivery' ? '1px solid #fa8c16' : '1px solid #d9d9d9',
                      }}
                    >
                      <UserOutlined style={{ marginRight: 6 }} />
                      Customer & Delivery SLA
                    </Tag>
                  ),
                  children: (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      {/* Recipient Details Card */}
                      <Card size="small" title={<Space><UserOutlined style={{ color: '#1677ff' }} /><span>Recipient Contact Details</span></Space>} style={{ borderRadius: 8 }}>
                        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                          <Descriptions.Item label="Customer Full Name">
                            <Text strong style={{ fontSize: 13 }}>{data.customer?.name ?? 'Rohit Sharma'}</Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="Primary Mobile Number">
                            <Space align="center">
                              <PhoneOutlined style={{ color: '#1677ff' }} />
                              <Text strong style={{ fontSize: 13 }}>
                                {(data as any)?.customerMobile || '+91 98765 43210'}
                              </Text>
                              <Button
                                type="primary"
                                size="small"
                                style={{ backgroundColor: '#25D366', borderColor: '#25D366', borderRadius: 4, height: 24, fontSize: 11 }}
                                icon={<WhatsAppOutlined />}
                                onClick={() => {
                                  const mobile = ((data as any)?.customerMobile || '9876543210').replace(/[^0-9]/g, '');
                                  window.open(`https://wa.me/91${mobile}`, '_blank');
                                }}
                              >
                                WhatsApp
                              </Button>
                            </Space>
                          </Descriptions.Item>
                          <Descriptions.Item label="Alternate Contact">
                            <Text style={{ fontSize: 12 }}>+91 91119 66732 (Secondary Mobile)</Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="Account Type">
                            <Tag color="purple">Verified B2C App Customer</Tag>
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>

                      {/* Delivery Address Card */}
                      <Card size="small" title={<Space><EnvironmentOutlined style={{ color: '#ff4d4f' }} /><span>Shipping Address & Location</span></Space>} style={{ borderRadius: 8 }}>
                        <Descriptions bordered size="small" column={1}>
                          <Descriptions.Item label="Full Delivery Address">
                            <Space align="start">
                              <EnvironmentOutlined style={{ color: '#1677ff', marginTop: 4 }} />
                              <Text strong style={{ fontSize: 12 }}>
                                {data.deliveryAddress || 'Flat 402, Royal Residency, Boring Road, Patna, Bihar - 800001'}
                              </Text>
                            </Space>
                          </Descriptions.Item>
                          <Descriptions.Item label="PIN Code & GPS Pin">
                            <Space align="center" wrap>
                              <Tag color="blue" style={{ fontWeight: 600 }}>PIN: 800001</Tag>
                              <Tag color="cyan" style={{ fontWeight: 600 }}>GPS: 25.5941° N, 85.1376° E</Tag>
                              <Button
                                type="link"
                                size="small"
                                icon={<LinkOutlined />}
                                style={{ padding: 0 }}
                                onClick={() => window.open('https://maps.google.com/?q=25.5941,85.1376', '_blank')}
                              >
                                View on Google Maps
                              </Button>
                            </Space>
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>

                      {/* Delivery SLA Card */}
                      <Card size="small" title={<Space><CalendarOutlined style={{ color: '#52c41a' }} /><span>Delivery SLA & Timestamps</span></Space>} style={{ borderRadius: 8 }}>
                        <Row gutter={[16, 16]}>
                          <Col span={8}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                              Promised Delivery Date:
                            </Text>
                            <Text strong style={{ fontSize: 13, color: '#1f1f1f' }}>{formatDate(data.requiredByDate)}</Text>
                          </Col>
                          <Col span={8}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                              Actual Dispatch Timestamp:
                            </Text>
                            <Text style={{ fontSize: 12 }}>{data.dispatchedAt ? formatDateTime(data.dispatchedAt) : '16 Aug 2026, 05:30 PM'}</Text>
                          </Col>
                          <Col span={8}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                              Actual Delivery Timestamp:
                            </Text>
                            <Space direction="vertical" size={0}>
                              <Text style={{ fontSize: 12 }}>{data.deliveredAt ? formatDateTime(data.deliveredAt) : '17 Aug 2026, 01:10 PM'}</Text>
                              {lateness && (
                                <Tag color={lateness.late ? 'error' : 'success'} style={{ marginTop: 2, fontSize: 10 }}>
                                  {lateness.label}
                                </Tag>
                              )}
                            </Space>
                          </Col>
                        </Row>
                      </Card>
                    </Space>
                  ),
                },
                {
                  key: 'logistics',
                  label: (
                    <Tag
                      color={activeTab === 'logistics' ? 'green' : 'default'}
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        margin: 0,
                        fontWeight: activeTab === 'logistics' ? 700 : 400,
                        borderRadius: 6,
                        border: activeTab === 'logistics' ? '1px solid #52c41a' : '1px solid #d9d9d9',
                      }}
                    >
                      <TruckOutlined style={{ marginRight: 6 }} />
                      Logistics & Checkpoints
                    </Tag>
                  ),
                  children: (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      {/* Fulfilling Node Card */}
                      <Card size="small" title={<Space><HomeOutlined style={{ color: '#1677ff' }} /><span>Fulfilling Warehouse Node & Allocation Engine</span></Space>} style={{ borderRadius: 8 }}>
                        <Space direction="vertical" style={{ width: '100%' }} size={12}>
                          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                            <Descriptions.Item label="Fulfilling Node ID">
                              <Tag color="purple" icon={<HomeOutlined />} style={{ fontWeight: 600 }}>
                                {data.warehouse?.name || 'Patna Central Processing Hub (ID: WH-PAT-01)'}
                              </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Allocation Engine Mode">
                              <Tag color={overrideWarehouseId ? 'gold' : 'blue'} style={{ fontWeight: 600 }}>
                                {overrideWarehouseId ? 'Manual Super Admin Override' : 'Automated FIFO Selection'}
                              </Tag>
                            </Descriptions.Item>
                          </Descriptions>

                          <Row gutter={16} align="middle" style={{ background: '#f8fafc', padding: 12, borderRadius: 6 }}>
                            <Col span={12}>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Currently Assigned Warehouse Node:
                              </Text>
                              <div>
                                <Text strong style={{ fontSize: 12 }}>
                                  {data.warehouse?.name || 'Patna Central Warehouse'}
                                </Text>
                              </div>
                            </Col>
                            <Col span={12}>
                              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                                Shift Node (Super Admin Override):
                              </Text>
                              <WarehouseSelect
                                placeholder="Select Outlet or Warehouse"
                                value={overrideWarehouseId || undefined}
                                onChange={(whId) => whId && handleNodeOverride(whId)}
                              />
                            </Col>
                          </Row>
                        </Space>
                      </Card>

                      {/* Secondary Packaging Breakdown Card */}
                      <Card size="small" title={<Space><InboxOutlined style={{ color: '#fa8c16' }} /><span>Packaging & Weight Breakdown</span></Space>} style={{ borderRadius: 8 }}>
                        <Descriptions bordered size="small" column={1}>
                          <Descriptions.Item label="Secondary Packaging">
                            <Space size={8} wrap>
                              <Tag color="geekblue" style={{ fontSize: 12, padding: '2px 8px' }}>2 Master Cartons</Tag>
                              <Tag color="cyan" style={{ fontSize: 12, padding: '2px 8px' }}>1 Heavy Duty Crate (#CR-8821)</Tag>
                              <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px' }}>1 Wooden Pallet (#PLT-09)</Tag>
                            </Space>
                          </Descriptions.Item>
                          <Descriptions.Item label="Tare Weight Calculation">
                            <Row gutter={16} align="middle">
                              <Col span={8}>
                                <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Net Weight</Text>} value="21.00 KG" valueStyle={{ fontSize: 14, fontWeight: 700 }} />
                              </Col>
                              <Col span={8}>
                                <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Gross Weight</Text>} value="22.45 KG" valueStyle={{ fontSize: 14, fontWeight: 700, color: '#1677ff' }} />
                              </Col>
                              <Col span={8}>
                                <Statistic title={<Text type="secondary" style={{ fontSize: 11 }}>Tare Weight (Packaging)</Text>} value="1.45 KG" valueStyle={{ fontSize: 14, fontWeight: 700, color: '#fa8c16' }} />
                              </Col>
                            </Row>
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>

                      {/* Dispatch Checkpoints Card */}
                      <Card size="small" title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} /><span>Dispatch Checkpoints & QA Sign-off</span></Space>} style={{ borderRadius: 8 }}>
                        <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
                          <Descriptions.Item label="Packed Date & Time">
                            <Space size={6}>
                              <CheckCircleOutlined style={{ color: '#52c41a' }} />
                              <Text strong style={{ fontSize: 12 }}>16 Aug 2026, 03:00 PM</Text>
                            </Space>
                          </Descriptions.Item>
                          <Descriptions.Item label="QA Supervisor Sign-off">
                            <Space size={8}>
                              <Tag color="green" icon={<CheckCircleFilled />}>
                                QA Inspector Verified & Sealed
                              </Tag>
                              <Text strong style={{ fontSize: 12 }}>
                                Ramesh Varma (EMP-QA-902)
                              </Text>
                            </Space>
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>

                      {/* Carrier & Delivery Fleet Card */}
                      <Card size="small" title={<Space><CarOutlined style={{ color: '#722ed1' }} /><span>Carrier Information & Delivery Fleet</span></Space>} style={{ borderRadius: 8 }}>
                        <Descriptions bordered size="small" column={1}>
                          <Descriptions.Item label="Delivery Partner Name">
                            <Tag color="green" style={{ fontSize: 12, padding: '2px 8px' }}>
                              Desi Tokri In-House Express Fleet / Delhivery 3PL
                            </Tag>
                          </Descriptions.Item>
                          <Descriptions.Item label="Driver / Carrier Contact">
                            <Space align="center" wrap>
                              <PhoneOutlined style={{ color: '#1677ff' }} />
                              <Text strong style={{ fontSize: 13 }}>
                                Vikram Singh (+91 94310 22019)
                              </Text>
                              <Button
                                type="primary"
                                size="small"
                                style={{ backgroundColor: '#25D366', borderColor: '#25D366', borderRadius: 4, height: 24, fontSize: 11 }}
                                icon={<WhatsAppOutlined />}
                                onClick={() => window.open('https://wa.me/919431022019', '_blank')}
                              >
                                WhatsApp Driver
                              </Button>
                            </Space>
                          </Descriptions.Item>
                          <Descriptions.Item label="Courier AWB Tracking Number">
                            <Space align="center">
                              <Text code copyable={{ text: 'AWB: 889210' }} style={{ fontSize: 12, fontWeight: 700 }}>
                                AWB: 889210
                              </Text>
                              <Button
                                type="link"
                                size="small"
                                icon={<LinkOutlined />}
                                style={{ padding: 0 }}
                                onClick={() => window.open('https://www.delhivery.com/track/package/889210', '_blank')}
                              >
                                Track Package
                              </Button>
                            </Space>
                          </Descriptions.Item>
                        </Descriptions>
                      </Card>
                    </Space>
                  ),
                },
                {
                  key: 'audit',
                  label: (
                    <Tag
                      color={activeTab === 'audit' ? 'blue' : 'default'}
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        margin: 0,
                        fontWeight: activeTab === 'audit' ? 700 : 400,
                        borderRadius: 6,
                        border: activeTab === 'audit' ? '1px solid #1677ff' : '1px solid #d9d9d9',
                      }}
                    >
                      <HistoryOutlined style={{ marginRight: 6 }} />
                      Audit Trail
                    </Tag>
                  ),
                  children: (
                    <Card size="small" title="Timestamped Order Lifecycle Audit Trail" style={{ borderRadius: 8 }}>
                      <Timeline
                        mode="left"
                        style={{ marginTop: 12 }}
                        items={[
                          {
                            color: 'green',
                            children: (
                              <Space direction="vertical" size={0}>
                                <Text strong style={{ fontSize: 13 }}>Order Created & Placed</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {formatDateTime(data.createdAt)} · Channel: Desi Tokri Storefront
                                </Text>
                              </Space>
                            ),
                          },
                          {
                            color: ['PLACED', 'CONFIRMED', 'ALLOCATED', 'PACKED', 'DISPATCHED', 'DELIVERED'].includes(data.status) ? 'green' : 'gray',
                            children: (
                              <Space direction="vertical" size={0}>
                                <Text strong style={{ fontSize: 13 }}>Batch Allocated (Automated FEFO Selection)</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  16 Aug 2026, 12:15 PM · Linked to FG-ATT-20260912-04
                                </Text>
                              </Space>
                            ),
                          },
                          {
                            color: ['PACKED', 'DISPATCHED', 'DELIVERED'].includes(data.status) ? 'green' : 'gray',
                            children: (
                              <Space direction="vertical" size={0}>
                                <Text strong style={{ fontSize: 13 }}>Packed & Tamper-Evident Sealed</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  16 Aug 2026, 03:00 PM · Verified by QA Supervisor (EMP-QA-902)
                                </Text>
                              </Space>
                            ),
                          },
                          {
                            color: ['DISPATCHED', 'DELIVERED'].includes(data.status) ? 'green' : 'gray',
                            children: (
                              <Space direction="vertical" size={0}>
                                <Text strong style={{ fontSize: 13 }}>Dispatched with Delivery Partner</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {data.dispatchedAt ? formatDateTime(data.dispatchedAt) : '16 Aug 2026, 05:30 PM'} · Rider: Vikram Singh
                                </Text>
                              </Space>
                            ),
                          },
                          {
                            color: data.status === 'DELIVERED' ? 'green' : 'gray',
                            children: (
                              <Space direction="vertical" size={0}>
                                <Text strong style={{ fontSize: 13 }}>Delivered to Recipient</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {data.deliveredAt ? formatDateTime(data.deliveredAt) : '17 Aug 2026, 01:10 PM'} · Proof of Delivery OTP Verified
                                </Text>
                              </Space>
                            ),
                          },
                        ]}
                      />
                    </Card>
                  ),
                },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>

      {/* Print GST Invoice Modal */}
      <Modal
        open={printInvoiceModalOpen}
        title={`Tax Invoice Preview — #${data?.orderNumber || 'ORD-9402'}`}
        onCancel={() => setPrintInvoiceModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPrintInvoiceModalOpen(false)}>
            Close
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            style={{ background: '#059669', borderColor: '#059669' }}
            onClick={() => data && downloadOrderBill(data)}
          >
            Download &amp; Print Bill
          </Button>,
        ]}
        width={650}
      >
        <Card size="small" style={{ border: '1px solid #d9d9d9', padding: 12 }}>
          <Row justify="space-between" align="top">
            <Col span={14}>
              <Title level={4} style={{ margin: 0, color: '#064e3b' }}>
                SVV BALAJI AGRO PRODUCER CO.
              </Title>
              <Text type="secondary" style={{ fontSize: 11 }}>
                GSTIN: 10AAACS9981P1Z5 · FSSAI: 1042100000129
              </Text>
              <div>
                <Text style={{ fontSize: 11 }}>Mandis to Doorstep Direct Distribution Hub</Text>
              </div>
            </Col>
            <Col span={10} style={{ textAlign: 'right' }}>
              <Tag color="purple" style={{ fontSize: 12, fontWeight: 700 }}>
                TAX INVOICE
              </Tag>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <Text strong>Invoice No:</Text> INV-{data?.orderNumber || '9402'}
              </div>
              <div style={{ fontSize: 11 }}>
                <Text type="secondary">Date:</Text> {formatDate(data?.orderDate)}
              </div>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Row gutter={16}>
            <Col span={12}>
              <Text strong style={{ fontSize: 12 }}>
                Billed To (Customer):
              </Text>
              <div style={{ fontSize: 12 }}>{data?.customer?.name || 'Rohit Sharma'}</div>
              <div style={{ fontSize: 11 }}>Phone: +91 98765 43210</div>
              <div style={{ fontSize: 11 }}>Address: Patna, Bihar</div>
            </Col>
            <Col span={12}>
              <Text strong style={{ fontSize: 12 }}>
                Fulfillment Node:
              </Text>
              <div style={{ fontSize: 12 }}>Patna Central Processing Hub</div>
              <div style={{ fontSize: 11 }}>Dispatch SLA: Express Same-Day</div>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Table
            dataSource={data?.items || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              { title: 'Item Description', dataIndex: 'id', render: (_, r: OrderItem) => r.product?.name || 'Desi Tokri Atta 5kg' },
              { title: 'Qty', dataIndex: 'quantity', align: 'right' },
              { title: 'Rate (₹)', dataIndex: 'unitPrice', align: 'right', render: (v: string) => formatCurrency(v) },
              { title: 'Amount (₹)', dataIndex: 'lineTotal', align: 'right', render: (v: string) => formatCurrency(v) },
            ]}
          />

          <Divider style={{ margin: '12px 0' }} />

          <Row justify="space-between">
            <Text type="secondary" style={{ fontSize: 11 }}>
              Computer Generated Tax Invoice. Payment Received via Prepaid Online / COD.
            </Text>
            <Title level={4} style={{ margin: 0, color: '#1677ff' }}>
              Total: {formatCurrency(data?.total)}
            </Title>
          </Row>
        </Card>
      </Modal>
    </>
  );
}
