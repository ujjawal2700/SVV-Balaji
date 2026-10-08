import { PrinterOutlined, ReloadOutlined, SettingOutlined, StopOutlined } from '@ant-design/icons';
import {
  Alert, App as AntApp, Button, Card, DatePicker, Descriptions, Drawer, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import {
  EINVOICE_STATUS_LABEL,
  IRN_CANCEL_REASON_LABEL,
  type EInvoiceStatus,
  type Invoice,
  type InvoiceRow,
  type InvoiceStatus,
  type InvoiceSupplyType,
  type IrnCancelReason,
} from '@shared/api/invoices';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { DataTable } from '@shared/components/DataTable';
import { PageHeader } from '@shared/components/PageHeader';
import { BranchSelect } from '@shared/components/pickers';
import { useCancelInvoice, useGstSettings, useInvoice, useInvoices, useRetryEInvoice } from '@shared/hooks/useInvoices';
import { formatCurrency, formatDate, formatDateTime, toIsoDay } from '@shared/utils/format';
import { printTaxInvoice } from '@shared/utils/taxInvoicePrint';
import { CreditNoteDrawer, CreditNotesList, InvoiceCreditNotes } from './CreditNotes';
import { EInvoiceTag } from './invoiceTags';

const { Text } = Typography;

/** Order detail lives under its channel's list. */
const orderPath = (channel: 'B2B' | 'B2C', id: string) => `/${channel.toLowerCase()}-orders/${id}`;

/**
 * GST tax invoices, newest first. Invoices are issued by the server at dispatch;
 * staff read, print, retry e-invoicing and (rarely) cancel them here.
 */
export function InvoicesPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const canSettings = useCan('GST_SETTINGS_VIEW');
  const settings = useGstSettings(canSettings);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | undefined>();
  const [supplyType, setSupplyType] = useState<InvoiceSupplyType | undefined>();
  const [eInvoiceStatus, setEInvoiceStatus] = useState<EInvoiceStatus | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [branchId, setBranchId] = useState<string | undefined>();
  const [page, setPage] = useState({ page: 1, limit: 20 });

  const q = useInvoices({
    search: search || undefined, status, supplyType, eInvoiceStatus, branchId,
    from: toIsoDay(range?.[0]), to: toIsoDay(range?.[1]), ...page,
  });
  const openId = params.get('open') ?? undefined;
  const noteId = params.get('note') ?? undefined;
  const tab = params.get('tab') === 'credit-notes' ? 'credit-notes' : 'invoices';
  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };
  const open = (id?: string) => setParam({ open: id });
  const openNote = (id?: string) => setParam({ note: id });

  const columns: ColumnsType<InvoiceRow> = [
    {
      title: 'Invoice',
      key: 'no',
      render: (_, r) => (
        <div>
          <a onClick={() => open(r.id)} style={{ fontWeight: 600 }}>{r.invoiceNumber}</a>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{formatDate(r.invoiceDate)}</Text></div>
        </div>
      ),
    },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, r) => (
        <div>
          <div>{r.customer?.name ?? r.buyer.legalName}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.customer?.gstin ?? r.buyer.gstin ?? 'Unregistered'}</Text>
        </div>
      ),
    },
    {
      title: 'Order / sale',
      key: 'order',
      render: (_, r) =>
        r.order ? (
          <Link to={orderPath(r.channel, r.order.id)}>{r.order.orderNumber}</Link>
        ) : r.posSale ? (
          <div><Link to="/pos-orders">{r.posSale.saleNumber}</Link><div><Text type="secondary" style={{ fontSize: 11 }}>{r.posSale.outlet.name}</Text></div></div>
        ) : '—',
    },
    { title: 'Type', dataIndex: 'supplyType', render: (t: InvoiceSupplyType) => <Tag style={{ margin: 0 }}>{t}</Tag> },
    {
      title: 'Supply',
      key: 'pos',
      render: (_, r) => (
        <Space size={4}>
          <Text>{r.isInterState ? 'IGST' : 'CGST+SGST'}</Text>
          {r.placeOfSupplyAssumed ? <Tag color="orange" style={{ margin: 0 }}>State assumed</Tag> : null}
        </Space>
      ),
    },
    { title: 'Taxable', dataIndex: 'taxableTotal', align: 'right', render: (v: string) => formatCurrency(v) },
    { title: 'GST', dataIndex: 'taxTotal', align: 'right', render: (v: string) => formatCurrency(v) },
    { title: 'Total', dataIndex: 'grandTotal', align: 'right', render: (v: string) => <Text strong>{formatCurrency(v)}</Text> },
    {
      title: 'E-invoice',
      key: 'einv',
      render: (_, r) => (r.status === 'CANCELLED' ? <Tag color="red" style={{ margin: 0 }}>Cancelled</Tag> : <EInvoiceTag status={r.eInvoiceStatus} error={r.eInvoiceError} />),
    },
  ];

  const s = settings.data;
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Tax Invoices"
        subtitle="GST invoices issued at dispatch. B2B invoices carry the buyer's GSTIN and, once e-invoicing is on, an IRN from the GSP."
        actions={canSettings ? <Link to="/settings/gst"><Button icon={<SettingOutlined />}>GST Settings</Button></Link> : null}
      />

      {s && !s.ready ? (
        <Alert
          type="warning"
          showIcon
          message="Invoices are not being issued yet"
          description={<>Complete <Link to="/settings/gst">GST Settings</Link> first. Missing: {s.missing.join(', ')}.</>}
        />
      ) : null}

      <Tabs
        activeKey={tab}
        onChange={(k) => setParam({ tab: k === 'credit-notes' ? k : undefined })}
        items={[{ key: 'invoices', label: 'Invoices' }, { key: 'credit-notes', label: 'Credit notes' }]}
        style={{ marginBottom: -8 }}
      />

      {tab === 'credit-notes' ? <CreditNotesList onOpen={(id) => openNote(id)} /> : null}

      {tab === 'invoices' ? <>
      <Card size="small" style={{ borderRadius: 10 }}>
        <Space wrap size={12}>
          <Input.Search allowClear placeholder="Invoice, order, customer or GSTIN" onSearch={(v) => { setSearch(v.trim()); setPage((p) => ({ ...p, page: 1 })); }} style={{ width: 280 }} />
          <DatePicker.RangePicker value={range} onChange={(v) => { setRange(v); setPage((p) => ({ ...p, page: 1 })); }} />
          <Select allowClear placeholder="B2B / B2C" style={{ width: 130 }} value={supplyType} onChange={setSupplyType}
            options={[{ value: 'B2B', label: 'B2B' }, { value: 'B2C', label: 'B2C' }]} />
          <Select allowClear placeholder="E-invoice" style={{ width: 170 }} value={eInvoiceStatus} onChange={setEInvoiceStatus}
            options={(Object.keys(EINVOICE_STATUS_LABEL) as EInvoiceStatus[]).map((k) => ({ value: k, label: EINVOICE_STATUS_LABEL[k] }))} />
          <Select allowClear placeholder="Status" style={{ width: 130 }} value={status} onChange={setStatus}
            options={[{ value: 'ISSUED', label: 'Issued' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
          {user?.role === 'SUPER_ADMIN' ? (
            <BranchSelect allowClear placeholder="All branches" value={branchId} onChange={setBranchId} style={{ width: 200 }} />
          ) : null}
        </Space>
      </Card>

      <DataTable<InvoiceRow>
        rows={q.data?.data}
        meta={q.data?.meta}
        onPageChange={(p, limit) => setPage({ page: p, limit })}
        columns={columns}
        rowKey="id"
        isLoading={q.isLoading}
        isFetching={q.isFetching}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyText="No invoices yet - they are issued when orders are dispatched"
      />
      </> : null}

      <InvoiceDrawer id={openId} onClose={() => open()} onOpenNote={(id) => openNote(id)} />
      <CreditNoteDrawer id={noteId} onClose={() => openNote()} />
    </Space>
  );
}

function InvoiceDrawer({ id, onClose, onOpenNote }: { id?: string; onClose: () => void; onOpenNote: (id: string) => void }) {
  const { message } = AntApp.useApp();
  const q = useInvoice(id);
  const canIssue = useCan('INVOICES_ISSUE');
  const canCancel = useCan('INVOICES_CANCEL');
  const retry = useRetryEInvoice();
  const [cancelOpen, setCancelOpen] = useState(false);
  const inv = q.data;

  const lineColumns: ColumnsType<Invoice['lines'][number]> = [
    { title: '#', dataIndex: 'lineNo', width: 40 },
    { title: 'Description', dataIndex: 'description' },
    { title: 'HSN/SAC', dataIndex: 'hsnSac', render: (v: string | null) => v ?? <Tag color="orange">Missing</Tag> },
    { title: 'Qty', key: 'qty', align: 'right', render: (_, l) => `${l.quantity} ${l.uqc}` },
    { title: 'Taxable', dataIndex: 'taxableValue', align: 'right', render: (v: number) => formatCurrency(v) },
    { title: 'GST %', dataIndex: 'gstRatePercent', align: 'right' },
    { title: 'Tax', key: 'tax', align: 'right', render: (_, l) => formatCurrency(l.cgstAmount + l.sgstAmount + l.igstAmount) },
    { title: 'Total', dataIndex: 'lineTotal', align: 'right', render: (v: number) => formatCurrency(v) },
  ];

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      width={Math.min(860, window.innerWidth)}
      title={inv ? `Invoice ${inv.invoiceNumber}` : 'Invoice'}
      extra={inv ? (
        <Space>
          {inv.status === 'ISSUED' && canCancel ? <Button danger icon={<StopOutlined />} onClick={() => setCancelOpen(true)}>Cancel</Button> : null}
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => { if (!printTaxInvoice(inv)) message.warning('Allow pop-ups to print'); }}>Print</Button>
        </Space>
      ) : null}
    >
      {q.isLoading ? <Text type="secondary">Loading…</Text> : null}
      {q.error ? <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load the invoice')} /> : null}
      {inv ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {inv.status === 'CANCELLED' ? (
            <Alert type="error" showIcon message={`Cancelled ${formatDateTime(inv.cancelledAt)}${inv.cancelledBy ? ` by ${inv.cancelledBy.fullName}` : ''}`} description={inv.cancelReason} />
          ) : null}
          {inv.placeOfSupplyAssumed ? (
            <Alert type="warning" showIcon message="Place of supply was assumed"
              description="No delivery state was found on the order or customer, so the seller's state was used. If that is wrong, cancel and re-issue after correcting the customer's address." />
          ) : null}
          {inv.status === 'ISSUED' && inv.eInvoiceStatus === 'FAILED' ? (
            <Alert
              type="warning"
              showIcon
              message="E-invoice (IRN) needs attention"
              description={inv.eInvoiceError}
              action={canIssue ? (
                <Button size="small" icon={<ReloadOutlined />} loading={retry.isPending}
                  onClick={() => retry.mutateAsync(inv.id).then(() => message.success('Resubmitted')).catch((e) => message.error(apiErrorMessage(e, 'Retry failed')))}>
                  Retry
                </Button>
              ) : null}
            />
          ) : null}

          <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
            <Descriptions.Item label="Date">{formatDate(inv.invoiceDate)}</Descriptions.Item>
            <Descriptions.Item label={inv.order ? 'Order' : 'Counter sale'}>
              {inv.order ? <Link to={orderPath(inv.channel, inv.order.id)}>{inv.order.orderNumber}</Link> : inv.posSale ? `${inv.posSale.saleNumber} · ${inv.posSale.outlet.name}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Buyer">{inv.buyer.legalName}</Descriptions.Item>
            <Descriptions.Item label="Buyer GSTIN">{inv.buyer.gstin ?? 'Unregistered'}</Descriptions.Item>
            <Descriptions.Item label="Place of supply">{inv.placeOfSupplyName} ({inv.placeOfSupply})</Descriptions.Item>
            <Descriptions.Item label="Tax">{inv.isInterState ? 'IGST (inter-state)' : 'CGST + SGST (intra-state)'}</Descriptions.Item>
            <Descriptions.Item label="E-invoice"><EInvoiceTag status={inv.eInvoiceStatus} /></Descriptions.Item>
            <Descriptions.Item label="Issued by">{inv.issuedBy?.fullName ?? 'Automatically at dispatch'}</Descriptions.Item>
            {inv.irn ? <Descriptions.Item label="IRN" span={2}><Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>{inv.irn}</Text></Descriptions.Item> : null}
          </Descriptions>

          <Table size="small" rowKey="lineNo" pagination={false} columns={lineColumns} dataSource={inv.lines} scroll={{ x: 640 }} />

          <Descriptions size="small" column={1} bordered style={{ maxWidth: 340, marginLeft: 'auto' }}>
            <Descriptions.Item label="Taxable value">{formatCurrency(inv.taxableTotal)}</Descriptions.Item>
            {inv.isInterState
              ? <Descriptions.Item label="IGST">{formatCurrency(inv.igstTotal)}</Descriptions.Item>
              : <>
                  <Descriptions.Item label="CGST">{formatCurrency(inv.cgstTotal)}</Descriptions.Item>
                  <Descriptions.Item label="SGST">{formatCurrency(inv.sgstTotal)}</Descriptions.Item>
                </>}
            {inv.roundOff ? <Descriptions.Item label="Round off">{formatCurrency(inv.roundOff)}</Descriptions.Item> : null}
            <Descriptions.Item label={<b>Total</b>}><b>{formatCurrency(inv.grandTotal)}</b></Descriptions.Item>
          </Descriptions>

          <InvoiceCreditNotes invoice={inv} onOpenNote={onOpenNote} />
        </Space>
      ) : null}

      {inv ? <CancelModal invoice={inv} open={cancelOpen} onClose={() => setCancelOpen(false)} /> : null}
    </Drawer>
  );
}

function CancelModal({ invoice, open, onClose }: { invoice: Invoice; open: boolean; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const cancel = useCancelInvoice();
  const [form] = Form.useForm<{ reasonCode: IrnCancelReason; remark: string }>();

  return (
    <Modal
      open={open}
      title={`Cancel ${invoice.invoiceNumber}?`}
      okText="Cancel invoice"
      okButtonProps={{ danger: true, loading: cancel.isPending }}
      cancelText="Keep it"
      onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          await cancel.mutateAsync({ id: invoice.id, ...v });
          message.success('Invoice cancelled. The order can now be invoiced again.');
          onClose();
        } catch (e) {
          message.error(apiErrorMessage(e, 'Could not cancel'), 8);
        }
      }}
    >
      <Typography.Paragraph type="secondary">
        The number is never reused. {invoice.irn ? 'The IRN is cancelled with the GSP too - only possible within 24 hours of issue.' : ''}{' '}
        If the goods were supplied and only part of the invoice is wrong, or the invoice is from a month already reported, issue a credit note instead.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" initialValues={{ reasonCode: '2' }}>
        <Form.Item name="reasonCode" label="Reason" rules={[{ required: true }]}>
          <Select options={(Object.keys(IRN_CANCEL_REASON_LABEL) as IrnCancelReason[]).map((k) => ({ value: k, label: IRN_CANCEL_REASON_LABEL[k] }))} />
        </Form.Item>
        <Form.Item name="remark" label="Remark" rules={[{ required: true, min: 3, max: 100, message: '3-100 characters' }]}>
          <Input maxLength={100} placeholder="e.g. Buyer GSTIN was wrong" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
