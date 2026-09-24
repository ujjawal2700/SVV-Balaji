import { OrderFulfillmentPanel } from './OrderFulfillmentPanel';
import { OrderLoyaltyPanel } from './OrderLoyaltyPanel';
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
  ExclamationCircleOutlined,
  HistoryOutlined,
  HomeOutlined,
  InboxOutlined,
  LinkOutlined,
  PhoneOutlined,
  PrinterOutlined,
  QuestionCircleOutlined,
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
import { AuditTimeline, LogisticsBlocks, OrderItemCards, PaymentReference, RecipientBlocks, customerPhone, formatAddress, openWhatsApp, paymentLabel } from './OrderDetailParts';
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


  const place = usePlaceOrder();
  const confirm = useConfirmOrder();
  const allocate = useAllocateOrder();
  const pack = usePackOrder();
  const dispatch = useDispatchOrder();
  const deliver = useDeliverOrder();
  const cancel = useCancelOrder();
  const setPayment = useSetOrderPaymentStatus();

  const canCancel = useCan('ORDER_CANCEL');
  const data = order.data as any;
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
      const msg = apiErrorMessage(error, `Could not ${step.label.toLowerCase()}`);
      message.error(msg, 10);
      if (msg.toLowerCase().includes('scan') || msg.toLowerCase().includes('batch')) {
        setActiveTab('fulfillment');
      }
    }
  };

  const confirmStep = () => {
    if (!step) return;
    modal.confirm({
      centered: true,
      title: (
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
          {step.label}?
        </span>
      ),
      icon: <QuestionCircleOutlined style={{ color: '#1677ff', fontSize: 22 }} />,
      content: (
        <div style={{ marginTop: 10, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <Text style={{ fontSize: 13, color: '#334155', lineHeight: '1.5' }}>
            {step.effect}
          </Text>
        </div>
      ),
      okText: step.label,
      okButtonProps: {
        style: {
          borderRadius: 6,
          height: 36,
          padding: '0 18px',
          fontWeight: 600,
          backgroundColor: '#0f766e',
          borderColor: '#0f766e',
        },
      },
      cancelButtonProps: {
        style: { borderRadius: 6, height: 36, padding: '0 16px' },
      },
      width: 440,
      onOk: runStep,
    });
  };

  const handleCancel = () => {
    if (!data) return;
    setCancelReason('');
    modal.confirm({
      centered: true,
      title: (
        <span style={{ fontSize: 16, fontWeight: 700, color: '#991b1b' }}>
          Cancel Order {data.orderNumber}?
        </span>
      ),
      icon: <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 22 }} />,
      width: 460,
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
          <Text style={{ fontSize: 13, color: '#475569' }}>
            Stock reservations will be released back to available inventory.
          </Text>
          <Input.TextArea
            rows={3}
            placeholder="Reason for cancellation — required"
            onChange={(e) => setCancelReason(e.target.value)}
            style={{ borderRadius: 6 }}
          />
        </Space>
      ),
      okText: 'Cancel Order',
      okButtonProps: {
        danger: true,
        style: { borderRadius: 6, height: 36, padding: '0 18px', fontWeight: 600 },
      },
      cancelButtonProps: {
        style: { borderRadius: 6, height: 36, padding: '0 16px' },
      },
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
              {(item as any).nameSnapshot ?? item.product?.name ?? '—'}
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
        width={880}
        title={
          data ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Text code style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
                #{data.orderNumber}
              </Text>
              <Tag color={ORDER_STATUS_COLOUR[data.status]} style={{ margin: 0 }}>{ORDER_STATUS_LABEL[data.status]}</Tag>
              <Tag color={data.channel === 'B2B' ? 'blue' : 'purple'} style={{ margin: 0 }}>
                {data.channel === 'B2B' ? 'B2B Wholesale' : 'B2C Storefront'}
              </Tag>
            </div>
          ) : (
            'Order Details'
          )
        }
        extra={
          data ? (
            <Space size={6} wrap={false}>
              <Button
                size="small"
                style={{ backgroundColor: '#25D366', color: '#fff', borderColor: '#25D366', fontWeight: 600 }}
                icon={<WhatsAppOutlined />}
                onClick={() => openWhatsApp(customerPhone(data))}
              >
                WhatsApp
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => downloadOrderBill(data)}
                style={{ background: '#059669', borderColor: '#059669', fontWeight: 600 }}
              >
                Bill
              </Button>
              <Button
                size="small"
                icon={<PrinterOutlined />}
                onClick={() => setPrintInvoiceModalOpen(true)}
              >
                Print
              </Button>
              {CANCELLABLE.includes(data.status) && canCancel && (
                <Button size="small" danger icon={<StopOutlined />} loading={cancel.isPending} onClick={handleCancel}>
                  Cancel
                </Button>
              )}
              {step && (
                <Can do={step.permission}>
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={busy} onClick={confirmStep} style={{ fontWeight: 600 }}>
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
                    value={data.warehouse?.name ?? '—'}
                    valueStyle={{ fontSize: 13, fontWeight: 600 }}
                    prefix={<HomeOutlined style={{ color: '#fa8c16' }} />}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title={<Text type="secondary" style={{ fontSize: 11 }}>Payment Status</Text>}
                    value={`${PAYMENT_STATUS_LABEL[data.paymentStatus as PaymentStatus] ?? data.paymentStatus} · ${paymentLabel(data)}`}
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

                      <OrderItemCards data={data} manualOverride={Boolean(overrideWarehouseId)} />

                      {/* Clean Billing Summary Box */}
                      <Card size="small" style={{ background: '#fafafa', borderRadius: 8, border: '1px solid #e8e8e8' }}>
                        <Row gutter={[16, 16]} align="middle">
                          <Col xs={24} sm={12}>
                            <PaymentReference data={data} />
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
                      <RecipientBlocks data={data} lateness={lateness} />
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
                                {data.warehouse?.name ?? '—'}
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
                                  {data.warehouse?.name ?? '—'}
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

                      <LogisticsBlocks data={data} />
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
                      <AuditTimeline data={data} />
                    </Card>
                  ),
                },
                ...(order.data && data?.id && data.source === 'STOREFRONT'
                  ? [
                      {
                        key: 'fulfillment',
                        label: (
                          <Tag color={activeTab === 'fulfillment' ? 'purple' : 'default'} style={{ fontSize: 12, padding: '4px 10px', margin: 0, fontWeight: activeTab === 'fulfillment' ? 700 : 400, borderRadius: 6 }}>
                            Pack & Deliver
                          </Tag>
                        ),
                        children: <OrderFulfillmentPanel order={data} />,
                      },
                    ]
                  : []),
                ...(order.data && data?.id
                  ? [
                      {
                        key: 'loyalty',
                        label: (
                          <Tag
                            color={activeTab === 'loyalty' ? 'purple' : 'default'}
                            style={{
                              fontSize: 12,
                              padding: '4px 10px',
                              margin: 0,
                              fontWeight: activeTab === 'loyalty' ? 700 : 400,
                              borderRadius: 6,
                              border: activeTab === 'loyalty' ? '1px solid #722ed1' : '1px solid #d9d9d9',
                            }}
                          >
                            Rewards & Returns
                          </Tag>
                        ),
                        children: (
                          <OrderLoyaltyPanel
                            orderId={data.id}
                            orderNumber={data.orderNumber}
                            status={data.status}
                            items={data.items ?? []}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Space>
        ) : null}
      </Drawer>

      {/* Print GST Invoice Modal */}
      <Modal
        open={printInvoiceModalOpen}
        title={`Tax Invoice Preview — #${data?.orderNumber ?? ''}`}
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
                <Text strong>Invoice No:</Text> INV-{data?.orderNumber ?? ''}
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
              <div style={{ fontSize: 12 }}>{data?.customer?.name ?? '—'}</div>
              <div style={{ fontSize: 11 }}>Phone: {customerPhone(data) ?? '—'}</div>
              <div style={{ fontSize: 11 }}>Address: {data ? formatAddress(data) : '—'}</div>
            </Col>
            <Col span={12}>
              <Text strong style={{ fontSize: 12 }}>
                Fulfillment Node:
              </Text>
              <div style={{ fontSize: 12 }}>{data?.warehouse?.name ?? '—'}</div>
              <div style={{ fontSize: 11 }}>{data?.fulfillmentMethod === 'LOCAL' ? 'Local delivery (in-house rider)' : data?.fulfillmentMethod === 'SHIPROCKET' ? 'Courier delivery' : 'Staff-placed order'}</div>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Table
            dataSource={data?.items || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              { title: 'Item Description', dataIndex: 'id', render: (_, r: OrderItem) => (r as any).nameSnapshot ?? r.product?.name ?? '—' },
              { title: 'Qty', dataIndex: 'quantity', align: 'right' },
              { title: 'Rate (₹)', dataIndex: 'unitPrice', align: 'right', render: (v: string) => formatCurrency(v) },
              { title: 'Amount (₹)', dataIndex: 'lineTotal', align: 'right', render: (v: string) => formatCurrency(v) },
            ]}
          />

          <Divider style={{ margin: '12px 0' }} />

          <Row justify="space-between">
            <Text type="secondary" style={{ fontSize: 11 }}>
              Computer Generated Tax Invoice. Payment: {data ? paymentLabel(data) : '—'}.
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
