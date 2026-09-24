import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  HomeOutlined,
  PhoneOutlined,
  PrinterOutlined,
  QuestionCircleOutlined,
  ShoppingOutlined,
  StopOutlined,
  TruckOutlined,
  UserOutlined,
  WalletOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Input,
  Modal,
  Result,
  Row,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiErrorMessage } from '../../api/client';
import type { AllocationShortfall, OrderItem, PaymentStatus } from '../../api/types';
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
} from '@shared/hooks/useSales';
import { useWarehouses } from '@shared/hooks/useWarehouses';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import { PAYMENT_STATUS_LABEL } from '@shared/utils/paymentStatus';
import { downloadOrderBill } from '../../utils/invoiceGenerator';
import { InfoRow, StatCard } from '../customers/detailPageParts';
import { CANCELLABLE, NEXT_STEP, ORDER_STATUS_LABEL } from './orderStatus';
import { OrderFulfillmentPanel } from './OrderFulfillmentPanel';
import { OrderLoyaltyPanel } from './OrderLoyaltyPanel';
import {
  AuditTimeline,
  LogisticsBlocks,
  OrderItemCards,
  PaymentReference,
  RecipientBlocks,
  customerPhone,
  formatAddress,
  openWhatsApp,
  paymentLabel,
} from './OrderDetailParts';

const { Text, Title } = Typography;

const STATUS_PILL: Record<string, string> = {
  DELIVERED: 'green',
  CANCELLED: 'red',
};

/** Full-page order detail (B2C & B2B), laid out like the customer profile page. */
export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = AntApp.useApp();
  const [activeTab, setActiveTab] = useState('items');
  const [cancelReason, setCancelReason] = useState('');
  const [, setRepriced] = useState<Array<{ orderItemId: string; from: number; to: number }>>([]);
  const [, setShortfalls] = useState<AllocationShortfall[]>([]);
  const [overrideWarehouseId, setOverrideWarehouseId] = useState<string | null>(null);
  const [printInvoiceModalOpen, setPrintInvoiceModalOpen] = useState(false);

  const order = useOrder(id);
  const warehouses = useWarehouses();

  const place = usePlaceOrder();
  const confirm = useConfirmOrder();
  const allocate = useAllocateOrder();
  const pack = usePackOrder();
  const dispatch = useDispatchOrder();
  const deliver = useDeliverOrder();
  const cancel = useCancelOrder();

  const canCancel = useCan('ORDER_CANCEL');
  const data = order.data as any;
  const step = data ? NEXT_STEP[data.status] : undefined;
  const listPath = data?.channel === 'B2B' ? '/b2b-orders' : '/b2c-orders';

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

  const busy = place.isPending || confirm.isPending || allocate.isPending || pack.isPending || dispatch.isPending || deliver.isPending;

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

  if (order.isLoading && !data) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card style={{ marginTop: 24, borderRadius: 16 }}>
        <Result
          status="404"
          title="Order Not Found"
          subTitle={`No order matches the requested ID (${id || ''}).`}
          extra={
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ borderRadius: 8 }}>
              Back to Orders
            </Button>
          }
        />
      </Card>
    );
  }

  const items: any[] = data.items ?? [];
  const totalPacks = items.reduce((acc: number, i: any) => acc + Number(i.quantity || 0), 0);
  const discountTotal = Number(data.discountTotal ?? 0);
  const deliveryFee = Number(data.deliveryFee ?? 0);
  const phone = customerPhone(data);
  const isB2B = data.channel === 'B2B';

  const tabLabel = (text: string, icon: React.ReactNode) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
      {icon}
      {text}
    </span>
  );

  return (
    <div style={{ padding: '16px 8px 32px 8px', maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        {/* Header card */}
        <div className="page-card" style={{ padding: '16px 24px' }}>
          <Row gutter={[16, 16]} align="middle" justify="space-between">
            <Col>
              <Space size={16} align="center">
                <Button
                  shape="circle"
                  icon={<ArrowLeftOutlined style={{ fontSize: 16, color: '#475569' }} />}
                  onClick={() => navigate(listPath)}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    width: 42,
                    height: 42,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: '#0f172a',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)',
                  }}
                >
                  <ShoppingOutlined />
                </div>
                <Space direction="vertical" size={2}>
                  <Space align="center" size={10} style={{ flexWrap: 'wrap' }}>
                    <Text className="page-title">#{data.orderNumber}</Text>
                    <Tooltip title="Copy order number">
                      <CopyOutlined
                        style={{ fontSize: 13, color: '#64748b', cursor: 'pointer' }}
                        onClick={() => handleCopy(data.orderNumber, 'Order number')}
                      />
                    </Tooltip>
                    <Tag className={`page-pill page-pill--${STATUS_PILL[data.status] ?? 'slate'}`}>
                      {(ORDER_STATUS_LABEL[data.status] ?? data.status).toUpperCase()}
                    </Tag>
                    <Tag color={isB2B ? 'blue' : 'purple'} style={{ margin: 0 }}>
                      {isB2B ? 'B2B Wholesale' : 'B2C Storefront'}
                    </Tag>
                  </Space>
                  <Text type="secondary" className="page-meta">
                    PLACED {formatDate(data.orderDate).toUpperCase()} • {data.customer?.name ?? '—'}
                    {data.customer?.customerCode ? ` (#${data.customer.customerCode})` : ''}
                  </Text>
                </Space>
              </Space>
            </Col>

            <Col>
              <Space size={10} style={{ flexWrap: 'wrap' }}>
                <Button
                  icon={<WhatsAppOutlined />}
                  onClick={() => openWhatsApp(phone)}
                  style={{ borderRadius: 8, color: '#16a34a', borderColor: '#bbf7d0' }}
                >
                  WhatsApp
                </Button>
                <Button icon={<DownloadOutlined />} onClick={() => downloadOrderBill(data)} style={{ borderRadius: 8 }}>
                  Bill
                </Button>
                <Button icon={<PrinterOutlined />} onClick={() => setPrintInvoiceModalOpen(true)} style={{ borderRadius: 8 }}>
                  Print
                </Button>
                {CANCELLABLE.includes(data.status) && canCancel && (
                  <Button danger icon={<StopOutlined />} loading={cancel.isPending} onClick={handleCancel} style={{ borderRadius: 8 }}>
                    Cancel
                  </Button>
                )}
                {step && (
                  <Can do={step.permission}>
                    <Button type="primary" icon={<CheckCircleOutlined />} loading={busy} onClick={confirmStep} style={{ borderRadius: 8, fontWeight: 600 }}>
                      {step.label}
                    </Button>
                  </Can>
                )}
              </Space>
            </Col>
          </Row>
        </div>

        <Row gutter={[20, 20]}>
          {/* Left column — who and where */}
          <Col xs={24} lg={7}>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              <Card bodyStyle={{ padding: '24px 20px' }} className="page-card">
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                  <Text className="page-section-label">CUSTOMER & DELIVERY</Text>
                  <InfoRow icon={<UserOutlined style={{ fontSize: 16 }} />} label="CUSTOMER" value={data.customer?.name ?? '—'} />
                  <InfoRow
                    icon={<PhoneOutlined style={{ fontSize: 16 }} />}
                    label="PHONE NUMBER"
                    value={phone ?? '—'}
                    extra={
                      phone && (
                        <Tooltip title="Direct WhatsApp Chat">
                          <WhatsAppOutlined style={{ color: '#22c55e', fontSize: 14, cursor: 'pointer' }} onClick={() => openWhatsApp(phone)} />
                        </Tooltip>
                      )
                    }
                  />
                  <InfoRow icon={<EnvironmentOutlined style={{ fontSize: 16 }} />} label="DELIVERY ADDRESS" value={formatAddress(data)} />
                  <InfoRow icon={<HomeOutlined style={{ fontSize: 16 }} />} label="FULFILLMENT NODE" value={data.warehouse?.name ?? '—'} />
                </Space>
              </Card>

              <div className="page-dark-card">
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Text style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                    FINAL PAYABLE TOTAL
                  </Text>
                  <Text style={{ color: '#ffffff', fontSize: 26, fontWeight: 700 }}>{formatCurrency(data.total)}</Text>
                  <Text style={{ color: '#cbd5e1', fontSize: 12 }}>
                    {PAYMENT_STATUS_LABEL[data.paymentStatus as PaymentStatus] ?? data.paymentStatus} · {paymentLabel(data)}
                  </Text>
                </Space>
              </div>
            </Space>
          </Col>

          {/* Right column — stats and tabs */}
          <Col xs={24} lg={17}>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              <Row gutter={[16, 16]}>
                <Col xs={12} sm={6}>
                  <StatCard icon={<WalletOutlined style={{ fontSize: 18 }} />} tone="blue" label="TOTAL AMOUNT" value={formatCurrency(data.total)} />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard
                    icon={<ShoppingOutlined style={{ fontSize: 18 }} />}
                    tone="green"
                    label="ORDERED ITEMS"
                    value={
                      <span>
                        {items.length} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>SKUs · {totalPacks} packs</span>
                      </span>
                    }
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard
                    icon={<HomeOutlined style={{ fontSize: 18 }} />}
                    tone="amber"
                    label="FULFILLMENT NODE"
                    value={<span style={{ fontSize: 15 }}>{data.warehouse?.name ?? '—'}</span>}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <StatCard
                    icon={<CheckCircleFilled style={{ fontSize: 18 }} />}
                    tone="pink"
                    label="PAYMENT STATUS"
                    value={<span style={{ fontSize: 15 }}>{PAYMENT_STATUS_LABEL[data.paymentStatus as PaymentStatus] ?? data.paymentStatus}</span>}
                  />
                </Col>
              </Row>

              {data.status === 'CANCELLED' && (
                <Alert
                  type="error"
                  showIcon
                  message={`Order Cancelled on ${formatDateTime(data.cancelledAt)}`}
                  description={data.cancelledReason || 'No reason specified.'}
                />
              )}

              <Card className="page-card" bodyStyle={{ padding: '8px 24px 24px' }}>
                <Tabs
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  items={[
                    {
                      key: 'items',
                      label: tabLabel(`ITEMS (${items.length})`, <ShoppingOutlined />),
                      children: (
                        <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 8 }}>
                          <Alert
                            type="info"
                            showIcon
                            style={{ padding: '6px 12px', borderRadius: 8 }}
                            message={
                              <Text style={{ fontSize: 12 }}>
                                <Text strong>Traceability Overview:</Text> View SKU breakdown, allocated FEFO batch codes, RM farm origin & supplier clusters.
                              </Text>
                            }
                          />

                          <OrderItemCards data={data} manualOverride={Boolean(overrideWarehouseId)} />

                          <Card size="small" style={{ background: '#fafafa', borderRadius: 10, border: '1px solid #e8e8e8' }}>
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
                                  {discountTotal > 0 && (
                                    <Row justify="space-between">
                                      <Text type="secondary">Discounts{data.couponCode ? ` (${data.couponCode})` : ''}:</Text>
                                      <Text style={{ color: '#52c41a' }}>− {formatCurrency(discountTotal)}</Text>
                                    </Row>
                                  )}
                                  <Row justify="space-between">
                                    <Text type="secondary">Estimated GST Tax:</Text>
                                    <Text>{formatCurrency(data.taxTotal)}</Text>
                                  </Row>
                                  <Row justify="space-between">
                                    <Text type="secondary">Delivery Fee:</Text>
                                    <Text style={{ color: deliveryFee === 0 ? '#52c41a' : undefined }}>
                                      {deliveryFee === 0 ? 'FREE' : formatCurrency(deliveryFee)}
                                    </Text>
                                  </Row>
                                  <Divider style={{ margin: '6px 0' }} />
                                  <Row justify="space-between" align="middle">
                                    <Text strong style={{ fontSize: 14 }}>Final Payable Total:</Text>
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
                      label: tabLabel('CUSTOMER & DELIVERY SLA', <UserOutlined />),
                      children: (
                        <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 8 }}>
                          <RecipientBlocks data={data} lateness={lateness} />
                        </Space>
                      ),
                    },
                    {
                      key: 'logistics',
                      label: tabLabel('LOGISTICS & CHECKPOINTS', <TruckOutlined />),
                      children: (
                        <Space direction="vertical" size={16} style={{ width: '100%', paddingTop: 8 }}>
                          <Card
                            size="small"
                            title={
                              <Space>
                                <HomeOutlined style={{ color: '#1677ff' }} />
                                <span>Fulfilling Warehouse Node & Allocation Engine</span>
                              </Space>
                            }
                            style={{ borderRadius: 10 }}
                          >
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
                              <Row gutter={16} align="middle" style={{ background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                                <Col span={12}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Currently Assigned Warehouse Node:</Text>
                                  <div>
                                    <Text strong style={{ fontSize: 12 }}>{data.warehouse?.name ?? '—'}</Text>
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
                      label: tabLabel('AUDIT TRAIL', <HistoryOutlined />),
                      children: (
                        <Card size="small" title="Timestamped Order Lifecycle Audit Trail" style={{ borderRadius: 10, marginTop: 8 }}>
                          <AuditTimeline data={data} />
                        </Card>
                      ),
                    },
                    ...(data.source === 'STOREFRONT'
                      ? [
                          {
                            key: 'fulfillment',
                            label: tabLabel('PACK & DELIVER', <TruckOutlined />),
                            children: (
                              <div style={{ paddingTop: 8 }}>
                                <OrderFulfillmentPanel order={data} />
                              </div>
                            ),
                          },
                        ]
                      : []),
                    {
                      key: 'loyalty',
                      label: tabLabel('REWARDS & RETURNS', <WalletOutlined />),
                      children: (
                        <div style={{ paddingTop: 8 }}>
                          <OrderLoyaltyPanel orderId={data.id} orderNumber={data.orderNumber} status={data.status} items={items} />
                        </div>
                      ),
                    },
                  ]}
                />
              </Card>
            </Space>
          </Col>
        </Row>
      </Space>

      {/* Print GST Invoice Modal */}
      <Modal
        open={printInvoiceModalOpen}
        title={`Tax Invoice Preview — #${data.orderNumber}`}
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
            onClick={() => downloadOrderBill(data)}
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
                <Text strong>Invoice No:</Text> INV-{data.orderNumber}
              </div>
              <div style={{ fontSize: 11 }}>
                <Text type="secondary">Date:</Text> {formatDate(data.orderDate)}
              </div>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Row gutter={16}>
            <Col span={12}>
              <Text strong style={{ fontSize: 12 }}>Billed To (Customer):</Text>
              <div style={{ fontSize: 12 }}>{data.customer?.name ?? '—'}</div>
              <div style={{ fontSize: 11 }}>Phone: {phone ?? '—'}</div>
              <div style={{ fontSize: 11 }}>Address: {formatAddress(data)}</div>
            </Col>
            <Col span={12}>
              <Text strong style={{ fontSize: 12 }}>Fulfillment Node:</Text>
              <div style={{ fontSize: 12 }}>{data.warehouse?.name ?? '—'}</div>
              <div style={{ fontSize: 11 }}>
                {data.fulfillmentMethod === 'LOCAL'
                  ? 'Local delivery (in-house rider)'
                  : data.fulfillmentMethod === 'SHIPROCKET'
                    ? 'Courier delivery'
                    : 'Staff-placed order'}
              </div>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Table
            dataSource={items}
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
              Computer Generated Tax Invoice. Payment: {paymentLabel(data)}.
            </Text>
            <Title level={4} style={{ margin: 0, color: '#1677ff' }}>
              Total: {formatCurrency(data.total)}
            </Title>
          </Row>
        </Card>
      </Modal>
    </div>
  );
}
