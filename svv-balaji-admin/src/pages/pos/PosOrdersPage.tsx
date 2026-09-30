import { ClockCircleOutlined, EyeOutlined, FileTextOutlined, PrinterOutlined, ReloadOutlined, RollbackOutlined, SearchOutlined, ShoppingCartOutlined, UserOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
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
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { posApi, CUSTOMER_TYPE_LABEL, type PosPaymentMode, type PosSale, type PosSaleRow, type PosSaleStatus } from '@shared/api/pos';
import { useCan } from '@shared/auth/useCan';
import { DataTable } from '@shared/components/DataTable';
import { usePosReport, usePosSale, usePosSales, useRefundPosSale } from '@shared/hooks/usePos';
import { toIsoDay } from '@shared/utils/format';
import { Can } from '../../components/Can';
import { PageHeader } from '../../components/PageHeader';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { OutletPicker, PaymentTag, printSale } from './posShared';

const { Text } = Typography;

/** Every counter sale across the company's stores, from the database. */
export function PosOrdersPage() {
  const { message } = AntApp.useApp();
  const [search, setSearch] = useState('');
  const [outletId, setOutletId] = useState<string | undefined>();
  const [paymentMode, setPaymentMode] = useState<PosPaymentMode | undefined>();
  const [status, setStatus] = useState<PosSaleStatus | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>([dayjs(), dayjs()]);
  const [page, setPage] = useState({ page: 1, limit: 20 });
  const [openId, setOpenId] = useState<string | undefined>();

  const from = toIsoDay(range?.[0]);
  const to = toIsoDay(range?.[1]);
  const sales = usePosSales({ search: search || undefined, outletId, paymentMode, status, from, to, ...page });
  const report = usePosReport({ outletId, from, to });
  const r = report.data;

  const print = async (id: string) => {
    try {
      const sale = await posApi.sale(id);
      if (!(await printSale(sale))) message.warning('Allow pop-ups to print');
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not print'));
    }
  };

  const columns: ColumnsType<PosSaleRow> = [
    {
      title: 'Sale & Date',
      key: 'no',
      width: 190,
      render: (_, s) => (
        <Space direction="vertical" size={2}>
          <a onClick={() => setOpenId(s.id)} style={{ fontWeight: 600 }}>{s.saleNumber}</a>
          <Text type="secondary" style={{ fontSize: 11 }}><ClockCircleOutlined /> {formatDateTime(s.createdAt)}</Text>
        </Space>
      ),
    },
    {
      title: 'Store',
      key: 'outlet',
      width: 200,
      render: (_, s) => (
        <Space direction="vertical" size={2}>
          <Text strong>{s.outlet.name}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}><UserOutlined /> {s.cashierName}</Text>
        </Space>
      ),
    },
    {
      title: 'Customer',
      key: 'customer',
      width: 200,
      render: (_, s) => (
        <Space direction="vertical" size={2}>
          <Text strong>{s.customerName}</Text>
          {s.customerPhone ? <Text type="secondary" style={{ fontSize: 11 }}>📱 {s.customerPhone}</Text> : null}
          {s.customerGstin ? <Tag color="volcano" style={{ fontSize: 10 }}>GST: {s.customerGstin}</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Items',
      key: 'items',
      render: (_, s) => (
        <div>
          <Text style={{ fontSize: 12 }}>{s.itemsSummary}</Text>
          <br />
          <Tag color="blue" style={{ fontSize: 10, marginTop: 4 }}>{s.itemCount} pack{s.itemCount === 1 ? '' : 's'}</Tag>
        </div>
      ),
    },
    { title: 'Bill', dataIndex: 'total', width: 110, align: 'right', render: (v: number) => <Text strong style={{ color: '#52c41a' }}>{formatCurrency(v)}</Text> },
    { title: 'Payment', dataIndex: 'paymentMode', width: 100, render: (m: PosPaymentMode) => <PaymentTag mode={m} /> },
    {
      title: 'Status',
      key: 'status',
      width: 150,
      render: (_, s) => (
        <Space direction="vertical" size={2}>
          <Tag color={s.status === 'COMPLETED' ? 'success' : 'error'} style={{ margin: 0 }}>{s.status}</Tag>
          {s.invoice ? <Text type="secondary" style={{ fontSize: 11 }}>{s.invoice.invoiceNumber}</Text> : s.status === 'COMPLETED' ? <Text type="secondary" style={{ fontSize: 11 }}>No invoice yet</Text> : null}
        </Space>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 150,
      render: (_, s) => (
        <Space size={6}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setOpenId(s.id)}>View</Button>
          <Tooltip title={s.invoice ? 'Print the GST invoice' : 'Print receipt'}>
            <Button size="small" type="primary" icon={<PrinterOutlined />} onClick={() => void print(s.id)} style={{ background: '#059669', borderColor: '#059669' }} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const reset = () => {
    setSearch('');
    setOutletId(undefined);
    setPaymentMode(undefined);
    setStatus(undefined);
    setRange([dayjs(), dayjs()]);
    setPage((p) => ({ ...p, page: 1 }));
  };

  return (
    <Can do="POS_VIEW" fallback={<div style={{ padding: 24 }}>Access Denied</div>}>
      <PageHeader title="POS Counter Orders & Invoices" subtitle="Every counter sale at the company's stores, with payment, the batches sold, its GST invoice, re-prints and refunds." />

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }} loading={report.isLoading}>
            <Statistic title="Counter bills (completed)" value={r?.totals.salesCount ?? 0} prefix={<ShoppingCartOutlined style={{ color: '#1890ff' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }} loading={report.isLoading}>
            <Statistic title="Net counter revenue" value={r?.totals.netSales ?? 0} precision={2} prefix="₹" valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }} loading={report.isLoading}>
            <Statistic title="Cash collected" value={r?.byMode.CASH.total ?? 0} precision={2} prefix="₹" valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8 }} loading={report.isLoading}>
            <Statistic title="Digital (UPI + Card)" value={(r?.byMode.UPI.total ?? 0) + (r?.byMode.CARD.total ?? 0)} precision={2} prefix="₹" valueStyle={{ color: '#13c2c2' }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Space wrap size={12}>
          <Input.Search
            allowClear
            placeholder="Sale number, customer name or phone"
            prefix={<SearchOutlined />}
            onSearch={(v) => { setSearch(v.trim()); setPage((p) => ({ ...p, page: 1 })); }}
            style={{ width: 280 }}
          />
          <OutletPicker allowAll value={outletId} onChange={(v) => { setOutletId(v); setPage((p) => ({ ...p, page: 1 })); }} style={{ width: 240 }} />
          <DatePicker.RangePicker value={range} onChange={(v) => { setRange(v); setPage((p) => ({ ...p, page: 1 })); }} />
          <Select allowClear placeholder="Payment" style={{ width: 130 }} value={paymentMode} onChange={setPaymentMode}
            options={[{ value: 'CASH', label: 'Cash' }, { value: 'UPI', label: 'UPI' }, { value: 'CARD', label: 'Card' }]} />
          <Select allowClear placeholder="Status" style={{ width: 140 }} value={status} onChange={setStatus}
            options={[{ value: 'COMPLETED', label: 'Completed' }, { value: 'REFUNDED', label: 'Refunded' }]} />
          <Button icon={<ReloadOutlined />} onClick={reset}>Reset</Button>
        </Space>
      </Card>

      <DataTable<PosSaleRow>
        rows={sales.data?.data}
        meta={sales.data?.meta}
        onPageChange={(p, limit) => setPage({ page: p, limit })}
        columns={columns}
        rowKey="id"
        isLoading={sales.isLoading}
        isFetching={sales.isFetching}
        error={sales.error}
        onRetry={() => void sales.refetch()}
        emptyText="No counter sales in this period"
      />

      <SaleDrawer id={openId} onClose={() => setOpenId(undefined)} onPrint={(id) => void print(id)} />
    </Can>
  );
}

function SaleDrawer({ id, onClose, onPrint }: { id?: string; onClose: () => void; onPrint: (id: string) => void }) {
  const q = usePosSale(id);
  const canRefund = useCan('POS_REFUND');
  const [refundOpen, setRefundOpen] = useState(false);
  const s = q.data;

  return (
    <Drawer
      title={<Space><FileTextOutlined style={{ color: '#1890ff' }} /><span>Counter sale {s?.saleNumber ?? ''}</span></Space>}
      width={Math.min(640, window.innerWidth)}
      open={Boolean(id)}
      onClose={onClose}
      extra={s ? (
        <Space>
          {s.status === 'COMPLETED' && canRefund ? <Button danger icon={<RollbackOutlined />} onClick={() => setRefundOpen(true)}>Refund</Button> : null}
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => onPrint(s.id)} style={{ background: '#059669', borderColor: '#059669' }}>
            {s.invoice ? 'Print invoice' : 'Print receipt'}
          </Button>
        </Space>
      ) : null}
    >
      {q.error ? <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load the sale')} /> : null}
      {s ? (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {s.status === 'REFUNDED' ? (
            <Alert type="error" showIcon message={`Refunded ${formatDateTime(s.refundedAt)}${s.refundedBy ? ` by ${s.refundedBy.fullName}` : ''}`} description={s.refundReason} />
          ) : null}
          <Descriptions title="Store & cashier" bordered size="small" column={1}>
            <Descriptions.Item label="Store">{s.outlet.name} ({s.outlet.code})</Descriptions.Item>
            <Descriptions.Item label="Cashier">{s.cashier.fullName} · {s.shift.shiftNumber}</Descriptions.Item>
            <Descriptions.Item label="Date & time">{formatDateTime(s.createdAt)}</Descriptions.Item>
          </Descriptions>
          <Descriptions title="Customer" bordered size="small" column={1}>
            <Descriptions.Item label="Name">{s.customerName}</Descriptions.Item>
            <Descriptions.Item label="Type"><Tag color="blue">{CUSTOMER_TYPE_LABEL[s.customerType]}</Tag></Descriptions.Item>
            {s.customerPhone ? <Descriptions.Item label="Mobile">{s.customerPhone}</Descriptions.Item> : null}
            {s.customerGstin ? <Descriptions.Item label="GSTIN">{s.customerGstin}</Descriptions.Item> : null}
          </Descriptions>
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={s.lines}
            scroll={{ x: 520 }}
            columns={[
              { title: 'Item', key: 'n', render: (_, l) => <div><Text strong>{l.nameSnapshot}</Text><div><Text type="secondary" style={{ fontSize: 11 }}>{l.skuSnapshot}</Text></div></div> },
              { title: 'Qty', dataIndex: 'quantity', align: 'right' },
              { title: 'Rate', dataIndex: 'unitPrice', align: 'right', render: (v: number) => formatCurrency(v) },
              { title: 'GST', dataIndex: 'gstRatePercent', align: 'right', render: (v: number) => `${v}%` },
              { title: 'Total', dataIndex: 'lineTotal', align: 'right', render: (v: number) => formatCurrency(v) },
              { title: 'Batches sold', key: 'b', render: (_, l) => l.batches.map((b) => <div key={b.fgBatchId}><Link to={`/trace?batch=${b.fgBatchNumber}`}>{b.fgBatchNumber}</Link> ×{b.quantity}</div>) },
            ]}
          />
          <Descriptions title="Bill & payment" bordered size="small" column={1}>
            <Descriptions.Item label="Subtotal">{formatCurrency(s.subtotal)}</Descriptions.Item>
            <Descriptions.Item label="Discount">-{formatCurrency(s.discountTotal)}</Descriptions.Item>
            <Descriptions.Item label="GST">{formatCurrency(s.taxTotal)}</Descriptions.Item>
            <Descriptions.Item label="Total"><Text strong style={{ fontSize: 16, color: '#52c41a' }}>{formatCurrency(s.total)}</Text></Descriptions.Item>
            <Descriptions.Item label="Payment"><PaymentTag mode={s.paymentMode} />{s.paymentReference ? ` · ${s.paymentReference}` : ''}</Descriptions.Item>
            {s.amountTendered !== null ? <Descriptions.Item label="Tendered / change">{formatCurrency(s.amountTendered)} / {formatCurrency(s.changeDue)}</Descriptions.Item> : null}
            <Descriptions.Item label="GST invoice">
              {s.invoice ? <Link to={`/invoices?open=${s.invoice.id}`}>{s.invoice.invoiceNumber}</Link> : s.invoices.length > 0 ? `${s.invoices[0].invoiceNumber} (cancelled)` : 'Not issued yet'}
            </Descriptions.Item>
          </Descriptions>
          <RefundModal sale={s} open={refundOpen} onClose={() => setRefundOpen(false)} />
        </Space>
      ) : null}
    </Drawer>
  );
}

function RefundModal({ sale, open, onClose }: { sale: PosSale; open: boolean; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const refund = useRefundPosSale();
  const [form] = Form.useForm<{ reason: string }>();
  return (
    <Modal
      title={`Refund ${sale.saleNumber}?`}
      open={open}
      onCancel={onClose}
      okText={`Refund ${formatCurrency(sale.total)}`}
      okButtonProps={{ danger: true, loading: refund.isPending }}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          await refund.mutateAsync({ id: sale.id, reason: v.reason.trim() });
          message.success('Refunded - stock is back in the store and the invoice is cancelled');
          form.resetFields();
          onClose();
        } catch (e) {
          message.error(apiErrorMessage(e, 'Could not refund'), 8);
        }
      }}
    >
      <Typography.Paragraph type="secondary">
        The whole bill is refunded: every pack goes back into the batch it came from and the GST invoice is cancelled.
        {sale.paymentMode === 'CASH' ? ' The cash comes out of your open shift’s drawer.' : ` Return the ${sale.paymentMode} payment to the customer.`}
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 3, max: 300, message: '3-300 characters' }]}>
          <Input.TextArea rows={2} placeholder="e.g. Customer returned sealed packs" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
