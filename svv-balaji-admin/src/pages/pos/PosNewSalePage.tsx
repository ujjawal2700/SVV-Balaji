import {
  BarcodeOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  FileTextOutlined,
  LockOutlined,
  MinusOutlined,
  PlusOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  SearchOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  UnlockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { CUSTOMER_TYPE_LABEL, type PosCatalogueItem, type PosCustomerInput, type PosPaymentMode, type PosSale } from '@shared/api/pos';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { useClosePosShift, useCreatePosSale, useMyPosShift, useOpenPosShift, usePosCatalogue, usePosOutlet } from '@shared/hooks/usePos';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { OutletPicker, printSale } from './posShared';

const { Text, Title, Paragraph } = Typography;

interface CartItem extends PosCatalogueItem {
  quantity: number;
}

const WALK_IN: PosCustomerInput = { type: 'WALK_IN', name: 'Walk-in customer' };
const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/**
 * POS billing terminal for a company store. The cashier works inside their own
 * shift; every price, tax figure and stock number shown before "Complete" is an
 * estimate from the catalogue - the server re-prices and takes the stock, and
 * the receipt shows what it decided.
 */
export function PosNewSalePage() {
  const { message } = AntApp.useApp();
  const { user } = useAuth();
  const canSell = useCan('POS_SELL');
  const [outletId, setOutletId] = useState<string | undefined>();
  const outlet = usePosOutlet(outletId);
  const shift = useMyPosShift(outletId);
  const catalogue = usePosCatalogue(shift.data ? outletId : undefined);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [customer, setCustomer] = useState<PosCustomerInput>(WALK_IN);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerForm] = Form.useForm<PosCustomerInput>();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PosPaymentMode>('CASH');
  const [cashTendered, setCashTendered] = useState<number | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [completed, setCompleted] = useState<PosSale | null>(null);
  const [openingCash, setOpeningCash] = useState<number | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const createSale = useCreatePosSale();
  const openShift = useOpenPosShift();

  const products = catalogue.data ?? [];
  const categories = useMemo(() => ['ALL', ...Array.from(new Set(products.map((p) => p.category)))], [products]);
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) &&
        (selectedCategory === 'ALL' || p.category === selectedCategory),
    );
  }, [products, searchQuery, selectedCategory]);

  // Estimate only - the same rule the server applies: discount spread over the lines before GST.
  const est = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + (i.unitPrice ?? 0) * i.quantity, 0);
    const discount = Math.min(discountAmount, subtotal);
    const tax = cart.reduce((s, i) => {
      const gross = (i.unitPrice ?? 0) * i.quantity;
      const share = subtotal > 0 ? (discount * gross) / subtotal : 0;
      return s + ((gross - share) * (i.gstRatePercent ?? 0)) / 100;
    }, 0);
    const total = Math.max(0, subtotal - discount + tax);
    return { subtotal, discount, tax, total };
  }, [cart, discountAmount]);
  const changeDue = paymentMode === 'CASH' && cashTendered !== null ? Math.max(0, cashTendered - est.total) : 0;

  const resetBill = () => {
    setCart([]);
    setDiscountAmount(0);
    setCashTendered(null);
    setPaymentReference('');
    setCustomer(WALK_IN);
    setRequestId(newRequestId());
  };

  const handleAddToCart = (product: PosCatalogueItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        if (existing.quantity >= product.availableStock) {
          message.warning(`Only ${product.availableStock} ${product.unit} in this store`);
          return prev;
        }
        return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const handleUpdateQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.id !== productId));
      return;
    }
    const p = products.find((x) => x.id === productId);
    if (p && qty > p.availableStock) {
      message.warning(`Cannot exceed ${p.availableStock} ${p.unit} in stock`);
      return;
    }
    setCart((prev) => prev.map((i) => (i.id === productId ? { ...i, quantity: qty } : i)));
  };

  const handleCompleteSale = async () => {
    if (!outletId || cart.length === 0) return;
    if (paymentMode === 'CASH' && (cashTendered === null || cashTendered < est.total)) {
      message.warning(`Cash tendered is less than the bill (${formatCurrency(est.total)})`);
      return;
    }
    try {
      const sale = await createSale.mutateAsync({
        outletId,
        items: cart.map((i) => ({ productId: i.id, quantity: i.quantity })),
        discount: est.discount || undefined,
        paymentMode,
        amountTendered: paymentMode === 'CASH' ? cashTendered ?? undefined : undefined,
        paymentReference: paymentMode !== 'CASH' ? paymentReference.trim() || undefined : undefined,
        customer: {
          ...customer,
          phone: customer.phone?.trim() || undefined,
          gstin: customer.gstin?.trim() || undefined,
          address: customer.address?.trim() || undefined,
          city: customer.city?.trim() || undefined,
        },
        clientRequestId: requestId,
      });
      setCompleted(sale);
      resetBill();
    } catch (e) {
      message.error(apiErrorMessage(e, 'The sale was not recorded'), 8);
    }
  };

  const columns: ColumnsType<PosCatalogueItem> = [
    {
      title: 'Item Details',
      key: 'name',
      render: (_, r) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13 }}>{r.name}</Text>
          <Space size={6} wrap>
            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>SKU: {r.sku}</Tag>
            <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>{r.category}</Tag>
            {r.unitPrice === null ? <Tag color="red" style={{ fontSize: 10, margin: 0 }}>No B2C price</Tag> : null}
          </Space>
        </Space>
      ),
    },
    {
      title: 'Stock',
      key: 'stock',
      width: 100,
      render: (_, r) => (
        <Tag color={r.availableStock === 0 ? 'red' : r.availableStock < 10 ? 'warning' : 'green'}>
          {r.availableStock} {r.unit}
        </Tag>
      ),
    },
    {
      title: 'Price',
      key: 'price',
      width: 120,
      render: (_, r) =>
        r.unitPrice === null ? '—' : (
          <div>
            <Text strong>{formatCurrency(r.unitPrice)}</Text>
            <div><Text type="secondary" style={{ fontSize: 11 }}>+{r.gstRatePercent}% GST</Text></div>
          </div>
        ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 90,
      render: (_, r) => (
        <Button type="primary" size="small" icon={<PlusOutlined />} disabled={r.availableStock === 0 || r.unitPrice === null} onClick={() => handleAddToCart(r)}>
          Add
        </Button>
      ),
    },
  ];

  const s = shift.data;
  return (
    <Can do="POS_SELL" fallback={<div style={{ padding: 24 }}>Access Denied</div>}>
      <PageHeader
        title="POS Counter Billing Terminal (New Sale)"
        subtitle="Bill walk-in customers at a company store. Prices, GST and stock come from the server; every sale issues its GST invoice."
        actions={[
          <OutletPicker key="outlet" autoSelect value={outletId} onChange={(v) => { setOutletId(v); resetBill(); }} />,
          <Tag key="cashier" color="cyan" style={{ fontSize: 13, padding: '4px 10px' }}>
            <UserOutlined /> {user?.fullName}{s ? ` · ${s.shiftNumber}` : ''}
          </Tag>,
          s ? (
            <Button key="close" icon={<LockOutlined />} onClick={() => setCloseOpen(true)}>Close shift</Button>
          ) : null,
        ]}
      />

      {!outletId ? (
        <Card><Empty description={<>Choose a store to start billing. No stores yet? <Link to="/outlets">Register one on Outlets</Link>.</>} /></Card>
      ) : shift.isLoading ? (
        <Card loading />
      ) : !s ? (
        <Card style={{ maxWidth: 520 }}>
          <Title level={4} style={{ marginTop: 0 }}><UnlockOutlined /> Open your shift</Title>
          <Paragraph type="secondary">
            Count the cash in the drawer before your first bill. Your sales and refunds are reconciled against it when you close.
          </Paragraph>
          <Space>
            <InputNumber
              prefix="₹"
              min={0}
              style={{ width: 200 }}
              placeholder="Opening cash"
              value={openingCash ?? outlet.data?.defaultOpeningCash ?? null}
              onChange={(v) => setOpeningCash(v === null ? null : Number(v))}
            />
            <Button
              type="primary"
              loading={openShift.isPending}
              disabled={!canSell}
              onClick={async () => {
                try {
                  await openShift.mutateAsync({ outletId, openingCash: openingCash ?? outlet.data?.defaultOpeningCash ?? 0 });
                  message.success('Shift opened - ready to bill');
                } catch (e) {
                  message.error(apiErrorMessage(e, 'Could not open the shift'));
                }
              }}
            >
              Open shift
            </Button>
          </Space>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14} xl={15}>
            <Card
              size="small"
              style={{ marginBottom: 16, borderRadius: 8, borderColor: '#d9d9d9' }}
              title={
                <Space>
                  <UserOutlined style={{ color: '#1890ff' }} />
                  <span>Customer</span>
                  <Tag color={customer.type === 'WALK_IN' ? 'blue' : 'purple'}>{CUSTOMER_TYPE_LABEL[customer.type ?? 'WALK_IN']}</Tag>
                </Space>
              }
              extra={
                <Button type="link" icon={<EditOutlined />} onClick={() => { customerForm.setFieldsValue(customer); setCustomerModalOpen(true); }}>
                  Edit Details
                </Button>
              }
            >
              <Row gutter={[16, 8]}>
                <Col span={12}><Text type="secondary">Name: </Text><Text strong>{customer.name || 'Walk-in customer'}</Text></Col>
                <Col span={12}><Text type="secondary">Mobile: </Text><Text strong>{customer.phone || '—'}</Text></Col>
                {customer.gstin ? <Col span={12}><Text type="secondary">GSTIN: </Text><Tag color="volcano">{customer.gstin}</Tag></Col> : null}
                {customer.city ? <Col span={12}><Text type="secondary">City: </Text><Text>{customer.city}</Text></Col> : null}
              </Row>
            </Card>

            <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
              <Row gutter={[12, 12]} align="middle">
                <Col xs={24} sm={12}>
                  <Input placeholder="Search product name or SKU…" prefix={<SearchOutlined />} suffix={<BarcodeOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} allowClear />
                </Col>
                <Col xs={24} sm={12}>
                  <Space wrap>
                    <Text type="secondary" style={{ fontSize: 12 }}>Category: </Text>
                    <Select value={selectedCategory} onChange={setSelectedCategory} style={{ width: 170 }} options={categories.map((c) => ({ value: c, label: c === 'ALL' ? 'All' : c }))} />
                  </Space>
                </Col>
              </Row>
            </Card>

            <Card title={<Space><ShopOutlined /><span>Store Inventory ({filteredProducts.length} items)</span></Space>} bodyStyle={{ padding: 0 }} style={{ borderRadius: 8 }}>
              <Table
                dataSource={filteredProducts}
                columns={columns}
                rowKey="id"
                loading={catalogue.isLoading}
                pagination={{ pageSize: 8 }}
                size="small"
                scroll={{ x: 560 }}
                locale={{ emptyText: 'No stock in this store yet - transfer finished goods to it from the Finished Goods screen' }}
              />
            </Card>
          </Col>

          <Col xs={24} lg={10} xl={9}>
            <Card
              title={
                <Row justify="space-between" align="middle" style={{ width: '100%' }}>
                  <Space>
                    <ShoppingCartOutlined style={{ fontSize: 18, color: '#52c41a' }} />
                    <span>Current Bill</span>
                    <Badge count={cart.length} showZero overflowCount={99} color="#52c41a" />
                  </Space>
                  {cart.length > 0 ? <Button type="text" danger icon={<ClearOutlined />} size="small" onClick={resetBill}>Clear</Button> : null}
                </Row>
              }
              style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <ShoppingCartOutlined style={{ fontSize: 42, color: '#bfbfbf' }} />
                  <Paragraph type="secondary" style={{ marginTop: 12 }}>Bill is empty. Click "+ Add" on a product to start.</Paragraph>
                </div>
              ) : (
                <div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
                    {cart.map((item) => (
                      <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px dashed #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, paddingRight: 8 }}>
                          <Text strong style={{ fontSize: 12, display: 'block' }}>{item.name}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {formatCurrency(item.unitPrice)} x {item.quantity} = <Text strong style={{ color: '#1890ff' }}>{formatCurrency((item.unitPrice ?? 0) * item.quantity)}</Text>
                          </Text>
                        </div>
                        <Space size={4}>
                          <Button size="small" icon={<MinusOutlined />} onClick={() => handleUpdateQty(item.id, item.quantity - 1)} />
                          <InputNumber min={1} max={item.availableStock} value={item.quantity} onChange={(v) => handleUpdateQty(item.id, Number(v) || 1)} style={{ width: 52 }} controls={false} size="small" />
                          <Button size="small" icon={<PlusOutlined />} onClick={() => handleUpdateQty(item.id, item.quantity + 1)} />
                          <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={() => handleUpdateQty(item.id, 0)} />
                        </Space>
                      </div>
                    ))}
                  </div>

                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    <Row justify="space-between"><Text type="secondary">Subtotal (before GST):</Text><Text strong>{formatCurrency(est.subtotal)}</Text></Row>
                    <Row justify="space-between" align="middle">
                      <Text type="secondary">Counter discount (₹):</Text>
                      <InputNumber min={0} max={est.subtotal} value={discountAmount} onChange={(v) => setDiscountAmount(Number(v) || 0)} size="small" style={{ width: 110 }} prefix="₹" />
                    </Row>
                    <Row justify="space-between"><Text type="secondary">GST (on the discounted value):</Text><Text>{formatCurrency(est.tax)}</Text></Row>
                    <Divider style={{ margin: '8px 0' }} />
                    <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                      <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase' }}>Net Payable (estimate)</Text>
                      <Title level={2} style={{ margin: 0, color: '#52c41a' }}>{formatCurrency(est.total)}</Title>
                    </div>
                  </Space>

                  <Divider style={{ margin: '12px 0' }} />

                  <Text strong style={{ marginBottom: 8, display: 'block' }}>Payment Mode:</Text>
                  <Radio.Group value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} buttonStyle="solid" style={{ width: '100%', marginBottom: 16 }}>
                    <Row gutter={[8, 8]}>
                      {([['CASH', <DollarOutlined key="c" />, 'Cash'], ['UPI', <QrcodeOutlined key="u" />, 'UPI QR'], ['CARD', <CreditCardOutlined key="d" />, 'Card']] as const).map(([v, icon, label]) => (
                        <Col span={8} key={v}>
                          <Radio.Button value={v} style={{ width: '100%', textAlign: 'center', height: 38, lineHeight: '36px', borderRadius: 6 }}>{icon} {label}</Radio.Button>
                        </Col>
                      ))}
                    </Row>
                  </Radio.Group>

                  {paymentMode === 'CASH' ? (
                    <Card size="small" style={{ background: '#fafafa', marginBottom: 16 }}>
                      <Row gutter={12} align="middle">
                        <Col span={12}>
                          <Text type="secondary">Cash tendered (₹):</Text>
                          <InputNumber min={0} value={cashTendered} onChange={(v) => setCashTendered(v === null ? null : Number(v))} style={{ width: '100%', marginTop: 4 }} prefix="₹" />
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">Change due (₹):</Text>
                          <Title level={4} style={{ margin: '4px 0 0 0', color: changeDue > 0 ? '#1890ff' : '#000' }}>{formatCurrency(changeDue)}</Title>
                        </Col>
                      </Row>
                    </Card>
                  ) : (
                    <Input
                      style={{ marginBottom: 16 }}
                      placeholder={paymentMode === 'UPI' ? 'UPI transaction ID (recommended)' : 'Card slip / approval number (recommended)'}
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      maxLength={80}
                    />
                  )}

                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<CheckCircleOutlined />}
                    loading={createSale.isPending}
                    onClick={() => void handleCompleteSale()}
                    style={{ height: 48, fontSize: 16, background: '#52c41a', borderColor: '#52c41a' }}
                  >
                    Complete Sale
                  </Button>
                </div>
              )}
            </Card>
          </Col>
        </Row>
      )}

      <Modal
        title="Customer details"
        open={customerModalOpen}
        onCancel={() => setCustomerModalOpen(false)}
        onOk={() => customerForm.submit()}
        okText="Use these details"
        width={560}
      >
        <Form
          form={customerForm}
          layout="vertical"
          onFinish={(v) => { setCustomer({ ...v, type: v.type ?? 'WALK_IN' }); setCustomerModalOpen(false); }}
          initialValues={customer}
        >
          <Form.Item name="type" label="Customer type">
            <Radio.Group buttonStyle="solid" options={Object.entries(CUSTOMER_TYPE_LABEL).map(([value, label]) => ({ value, label }))} optionType="button" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="name" label="Name" rules={[{ max: 120 }]}><Input placeholder="Walk-in customer" prefix={<UserOutlined />} /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="Mobile" rules={[{ pattern: /^[0-9+\- ]{10,15}$/, message: '10-15 digits' }]}><Input placeholder="e.g. 9876543210" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="gstin" label="GSTIN (for a B2B tax invoice)" normalize={(v: string) => v?.toUpperCase().replace(/\s/g, '')}
                rules={[{ pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, message: '15 characters, e.g. 27AAAAA0000A1Z5' }]}>
                <Input maxLength={15} />
              </Form.Item>
            </Col>
            <Col span={12}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="address" label="Address (optional)"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<Space><FileTextOutlined style={{ color: '#52c41a' }} /><span>Sale complete — {completed?.saleNumber}</span></Space>}
        open={Boolean(completed)}
        onCancel={() => setCompleted(null)}
        footer={[
          <Button key="new" onClick={() => setCompleted(null)}>New bill</Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
            onClick={async () => {
              if (!completed) return;
              try {
                if (!(await printSale(completed))) message.warning('Allow pop-ups to print');
              } catch (e) {
                message.error(apiErrorMessage(e, 'Could not load the invoice'));
              }
            }}
          >
            {completed?.invoice ? 'Print GST invoice' : 'Print receipt'}
          </Button>,
        ]}
        width={620}
      >
        {completed ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {completed.invoice ? (
              <Alert type="success" showIcon message={`GST invoice ${completed.invoice.invoiceNumber} issued`} />
            ) : (
              <Alert type="warning" showIcon message="No GST invoice yet" description="GST Settings are not complete; the invoice is issued automatically once they are. You can print a receipt now." />
            )}
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Customer">{completed.customerName}</Descriptions.Item>
              <Descriptions.Item label="Time">{formatDateTime(completed.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{formatCurrency(completed.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{formatCurrency(completed.discountTotal)}</Descriptions.Item>
              <Descriptions.Item label="GST">{formatCurrency(completed.taxTotal)}</Descriptions.Item>
              <Descriptions.Item label="Total"><Text strong style={{ color: '#52c41a' }}>{formatCurrency(completed.total)}</Text></Descriptions.Item>
              <Descriptions.Item label="Paid by">{completed.paymentMode}</Descriptions.Item>
              {completed.changeDue !== null ? <Descriptions.Item label="Change">{formatCurrency(completed.changeDue)}</Descriptions.Item> : null}
            </Descriptions>
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={completed.lines}
              columns={[
                { title: 'Item', dataIndex: 'nameSnapshot' },
                { title: 'Qty', dataIndex: 'quantity', align: 'right' },
                { title: 'Batches', key: 'b', render: (_, l) => l.batches.map((b) => `${b.fgBatchNumber} ×${b.quantity}`).join(', ') },
                { title: 'Total', dataIndex: 'lineTotal', align: 'right', render: (v: number) => formatCurrency(v) },
              ]}
            />
          </Space>
        ) : null}
      </Modal>

      {s ? <CloseShiftModal open={closeOpen} onClose={() => setCloseOpen(false)} shiftId={s.id} shiftNumber={s.shiftNumber} expected={s.expectedCash} /> : null}
    </Can>
  );
}

/** Count the drawer and close. Shows the expected figure so the cashier can recount before submitting. */
export function CloseShiftModal({ open, onClose, shiftId, shiftNumber, expected }: { open: boolean; onClose: () => void; shiftId: string; shiftNumber: string; expected: number }) {
  const { message } = AntApp.useApp();
  const close = useClosePosShift();
  const [form] = Form.useForm<{ countedCash: number; notes?: string }>();
  const counted = Form.useWatch('countedCash', form);
  const diff = typeof counted === 'number' ? Math.round((counted - expected) * 100) / 100 : null;

  return (
    <Modal
      title={`Close shift ${shiftNumber}`}
      open={open}
      onCancel={onClose}
      okText="Close shift"
      okButtonProps={{ loading: close.isPending }}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          const r = (await close.mutateAsync({ id: shiftId, countedCash: v.countedCash, notes: v.notes?.trim() || undefined })) as { discrepancy: string | number };
          const d = Number(r.discrepancy);
          message[d === 0 ? 'success' : 'warning'](d === 0 ? 'Shift closed - drawer balanced' : `Shift closed with a difference of ${formatCurrency(d)}`);
          form.resetFields();
          onClose();
        } catch (e) {
          message.error(apiErrorMessage(e, 'Could not close the shift'));
        }
      }}
    >
      <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Expected cash in drawer"><Text strong style={{ fontSize: 15, color: '#1890ff' }}>{formatCurrency(expected)}</Text></Descriptions.Item>
        {diff !== null ? (
          <Descriptions.Item label="Difference">
            <Text strong style={{ color: diff === 0 ? '#52c41a' : '#ff4d4f' }}>{diff === 0 ? 'Balanced' : formatCurrency(diff)}</Text>
          </Descriptions.Item>
        ) : null}
      </Descriptions>
      <Form form={form} layout="vertical">
        <Form.Item name="countedCash" label="Cash counted in the drawer (₹)" rules={[{ required: true, message: 'Count the drawer' }]}>
          <InputNumber min={0} prefix="₹" size="large" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="Remarks"><Input.TextArea rows={2} maxLength={500} placeholder="Reason for any difference, handover notes" /></Form.Item>
      </Form>
    </Modal>
  );
}
