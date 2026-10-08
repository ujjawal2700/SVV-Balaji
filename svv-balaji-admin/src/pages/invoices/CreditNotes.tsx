import { FileExcelOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, App as AntApp, Button, Card, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import {
  CREDIT_NOTE_REASON_LABEL,
  creditNoteAsInvoice,
  creditNotesApi,
  type CreditableLine,
  type CreditNoteReason,
  type CreditNoteRow,
} from '@shared/api/creditNotes';
import type { Invoice } from '@shared/api/invoices';
import { useAuth } from '@shared/auth/useAuth';
import { useCan } from '@shared/auth/useCan';
import { DataTable } from '@shared/components/DataTable';
import { BranchSelect } from '@shared/components/pickers';
import { formatCurrency, formatDate, formatDateTime, toIsoDay } from '@shared/utils/format';
import { printTaxInvoice } from '@shared/utils/taxInvoicePrint';
import { EInvoiceTag } from './invoiceTags';

const { Text } = Typography;

const keys = {
  all: ['creditNotes'] as const,
  list: (q: object) => ['creditNotes', 'list', q] as const,
  one: (id: string) => ['creditNotes', 'one', id] as const,
  forInvoice: (id: string) => ['creditNotes', 'invoice', id] as const,
  creditable: (id: string) => ['creditNotes', 'creditable', id] as const,
};

/** Credit notes against one invoice, shown inside the invoice drawer. */
export function InvoiceCreditNotes({ invoice, onOpenNote }: { invoice: Invoice; onOpenNote: (id: string) => void }) {
  const canIssue = useCan('CREDIT_NOTES_ISSUE');
  const [issuing, setIssuing] = useState(false);
  const notes = useQuery({ queryKey: keys.forInvoice(invoice.id), queryFn: () => creditNotesApi.forInvoice(invoice.id) });
  const creditable = useQuery({ queryKey: keys.creditable(invoice.id), queryFn: () => creditNotesApi.creditable(invoice.id) });
  const credited = (notes.data ?? []).filter((n) => n.status === 'ISSUED').reduce((s, n) => s + n.grandTotal, 0);
  const anythingLeft = (creditable.data?.lines ?? []).some((l) => l.remainingAmount > 0);

  return (
    <Card
      size="small"
      title="Credit notes"
      extra={
        canIssue && invoice.status === 'ISSUED' && creditable.data?.open && anythingLeft ? (
          <Button size="small" icon={<PlusOutlined />} onClick={() => setIssuing(true)}>Issue credit note</Button>
        ) : null
      }
    >
      {notes.data?.length ? (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={notes.data}
            columns={[
              { title: 'Note', dataIndex: 'noteNumber', render: (v: string, r) => <a onClick={() => onOpenNote(r.id)}>{v}</a> },
              { title: 'Date', dataIndex: 'noteDate', render: (v: string) => formatDate(v) },
              { title: 'Reason', dataIndex: 'reasonLabel' },
              { title: 'Amount', dataIndex: 'grandTotal', align: 'right', render: (v: number) => formatCurrency(v) },
              { title: '', key: 's', render: (_, r) => (r.status === 'CANCELLED' ? <Tag color="red">Cancelled</Tag> : <EInvoiceTag status={r.eInvoiceStatus} />) },
            ]}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Credited {formatCurrency(credited)} of {formatCurrency(invoice.grandTotal)}.
          </Text>
        </Space>
      ) : (
        <Text type="secondary">
          None. Returns get theirs automatically when the refund is completed.
          {creditable.data && !creditable.data.open && invoice.status === 'ISSUED'
            ? ` The last day to credit this invoice was ${formatDate(new Date(new Date(creditable.data.deadline).getTime() - 1).toISOString())}.`
            : ''}
        </Text>
      )}
      {creditable.data ? (
        <IssueCreditNoteModal
          open={issuing}
          invoice={invoice}
          lines={creditable.data.lines}
          onClose={() => setIssuing(false)}
          onIssued={(id) => { setIssuing(false); onOpenNote(id); }}
        />
      ) : null}
    </Card>
  );
}

type Mode = 'QTY' | 'AMOUNT';

function IssueCreditNoteModal({
  open, invoice, lines, onClose, onIssued,
}: { open: boolean; invoice: Invoice; lines: CreditableLine[]; onClose: () => void; onIssued: (id: string) => void }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<{ reason: CreditNoteReason; remark: string }>();
  const [mode, setMode] = useState<Mode>('QTY');
  const [values, setValues] = useState<Record<string, number | null>>({});
  useEffect(() => { if (open) { setValues({}); setMode('QTY'); form.resetFields(); } }, [open, form]);

  const issue = useMutation({
    mutationFn: (input: Parameters<typeof creditNotesApi.issue>[1]) => creditNotesApi.issue(invoice.id, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }),
  });

  const chosen = lines.filter((l) => (values[l.invoiceLineId] ?? 0) > 0);
  const estimate = useMemo(
    () => chosen.reduce((s, l) => s + (mode === 'AMOUNT' ? values[l.invoiceLineId]! : (l.lineTotal * values[l.invoiceLineId]!) / l.quantity), 0),
    [chosen, mode, values],
  );

  const columns: ColumnsType<CreditableLine> = [
    { title: 'Line', key: 'd', render: (_, l) => <div>{l.description}<div><Text type="secondary" style={{ fontSize: 12 }}>{l.sku} · {l.gstRatePercent}% GST</Text></div></div> },
    { title: 'Invoiced', key: 'inv', align: 'right', render: (_, l) => <div>{l.quantity} · {formatCurrency(l.lineTotal)}</div> },
    { title: 'Already credited', key: 'cr', align: 'right', render: (_, l) => (l.creditedAmount ? `${l.creditedQuantity} · ${formatCurrency(l.creditedAmount)}` : '—') },
    {
      title: mode === 'QTY' ? 'Packs coming back' : 'Amount off (incl. GST)',
      key: 'v',
      width: 180,
      render: (_, l) => {
        const max = mode === 'QTY' ? l.remainingQuantity : l.remainingAmount;
        if (max <= 0) return <Text type="secondary">Fully credited</Text>;
        return (
          <InputNumber
            min={0}
            max={max}
            step={mode === 'QTY' ? 1 : 0.01}
            precision={mode === 'QTY' ? 0 : 2}
            prefix={mode === 'AMOUNT' ? '₹' : undefined}
            placeholder={`up to ${mode === 'QTY' ? max : max.toFixed(2)}`}
            value={values[l.invoiceLineId] ?? null}
            onChange={(v) => setValues((s) => ({ ...s, [l.invoiceLineId]: v }))}
            style={{ width: '100%' }}
          />
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      width={820}
      title={`Credit note against ${invoice.invoiceNumber}`}
      okText={`Issue credit note${chosen.length ? ` (about ${formatCurrency(estimate)})` : ''}`}
      okButtonProps={{ disabled: !chosen.length, loading: issue.isPending }}
      onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          const note = await issue.mutateAsync({
            ...v,
            lines: chosen.map((l) => (mode === 'QTY'
              ? { invoiceLineId: l.invoiceLineId, quantity: values[l.invoiceLineId]! }
              : { invoiceLineId: l.invoiceLineId, amount: values[l.invoiceLineId]! })),
          });
          message.success(`Credit note ${note.noteNumber} issued`);
          onIssued(note.id);
        } catch (e) {
          message.error(apiErrorMessage(e, 'Could not issue the credit note'), 8);
        }
      }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text type="secondary">
          A credit note reduces the GST declared on this invoice and is reported in GSTR-1 for this month. It does not
          move money or stock by itself - refunds and returns have their own screens.
        </Text>
        <Segmented
          value={mode}
          onChange={(m) => { setMode(m as Mode); setValues({}); }}
          options={[{ label: 'Goods returned (by quantity)', value: 'QTY' }, { label: 'Price reduced (by amount)', value: 'AMOUNT' }]}
        />
        <Table size="small" rowKey="invoiceLineId" pagination={false} columns={columns} dataSource={lines} />
        <Form form={form} layout="vertical" initialValues={{ reason: 'SALES_RETURN' }}>
          <Form.Item name="reason" label="Reason" rules={[{ required: true }]}>
            <Select options={(Object.keys(CREDIT_NOTE_REASON_LABEL) as CreditNoteReason[]).map((k) => ({ value: k, label: CREDIT_NOTE_REASON_LABEL[k] }))} />
          </Form.Item>
          <Form.Item name="remark" label="Remark (printed on the note)" rules={[{ required: true, min: 3, max: 200, message: '3-200 characters' }]}>
            <Input maxLength={200} placeholder="e.g. 2 packs damaged in transit, accepted back" />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
}

/** One credit note: lines, totals, IRN, print, cancel. */
export function CreditNoteDrawer({ id, onClose }: { id?: string; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const canCancel = useCan('INVOICES_CANCEL');
  const canIssue = useCan('INVOICES_ISSUE');
  const q = useQuery({ queryKey: keys.one(id ?? ''), queryFn: () => creditNotesApi.get(id!), enabled: Boolean(id) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [remark, setRemark] = useState('');
  const n = q.data;
  const retry = useMutation({ mutationFn: (x: string) => creditNotesApi.retryEInvoice(x), onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }) });
  const cancel = useMutation({ mutationFn: (x: { id: string; remark: string }) => creditNotesApi.cancel(x.id, x.remark), onSuccess: () => void qc.invalidateQueries({ queryKey: keys.all }) });

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      width={Math.min(860, window.innerWidth)}
      title={n ? `Credit note ${n.noteNumber}` : 'Credit note'}
      extra={n ? (
        <Space>
          {n.status === 'ISSUED' && canCancel ? <Button danger icon={<StopOutlined />} onClick={() => setCancelOpen(true)}>Cancel</Button> : null}
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => {
              const ok = printTaxInvoice(creditNoteAsInvoice(n), {
                badge: 'Credit Note',
                totalLabel: 'Credit note total',
                reference: `Against invoice ${n.invoice.invoiceNumber} dated ${formatDate(n.invoice.invoiceDate)}`,
              });
              if (!ok) message.warning('Allow pop-ups to print');
            }}
          >
            Print
          </Button>
        </Space>
      ) : null}
    >
      {q.isLoading ? <Text type="secondary">Loading…</Text> : null}
      {q.error ? <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load the credit note')} /> : null}
      {n ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {n.status === 'CANCELLED' ? (
            <Alert type="error" showIcon message={`Cancelled ${formatDateTime(n.cancelledAt)}${n.cancelledBy ? ` by ${n.cancelledBy.fullName}` : ''}`} description={n.cancelReason} />
          ) : null}
          {n.status === 'ISSUED' && n.eInvoiceStatus === 'FAILED' ? (
            <Alert
              type="warning"
              showIcon
              message="E-invoice (IRN) needs attention"
              description={n.eInvoiceError}
              action={canIssue ? (
                <Button size="small" icon={<ReloadOutlined />} loading={retry.isPending}
                  onClick={() => retry.mutateAsync(n.id).then(() => message.success('Resubmitted')).catch((e) => message.error(apiErrorMessage(e, 'Retry failed')))}>
                  Retry
                </Button>
              ) : null}
            />
          ) : null}
          <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
            <Descriptions.Item label="Date">{formatDate(n.noteDate)}</Descriptions.Item>
            <Descriptions.Item label="Against invoice">{n.invoice.invoiceNumber} ({formatDate(n.invoice.invoiceDate)})</Descriptions.Item>
            <Descriptions.Item label="Reason">{n.reasonLabel}</Descriptions.Item>
            <Descriptions.Item label={n.invoice.order ? 'Order' : 'Counter sale'}>
              {n.invoice.order ? n.invoice.order.orderNumber : n.invoice.posSale?.saleNumber ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Buyer">{n.buyer.legalName}</Descriptions.Item>
            <Descriptions.Item label="Buyer GSTIN">{n.buyer.gstin ?? 'Unregistered'}</Descriptions.Item>
            {n.returnRequest ? <Descriptions.Item label="Return">{n.returnRequest.requestNumber}</Descriptions.Item> : null}
            <Descriptions.Item label="Issued by">{n.issuedBy?.fullName ?? 'Automatically'}</Descriptions.Item>
            <Descriptions.Item label="E-invoice"><EInvoiceTag status={n.eInvoiceStatus} /></Descriptions.Item>
            {n.remark ? <Descriptions.Item label="Remark" span={2}>{n.remark}</Descriptions.Item> : null}
            {n.irn ? <Descriptions.Item label="IRN" span={2}><Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>{n.irn}</Text></Descriptions.Item> : null}
          </Descriptions>
          <Table
            size="small"
            rowKey="lineNo"
            pagination={false}
            dataSource={n.lines}
            scroll={{ x: 600 }}
            columns={[
              { title: '#', dataIndex: 'lineNo', width: 40 },
              { title: 'Description', dataIndex: 'description' },
              { title: 'HSN/SAC', dataIndex: 'hsnSac', render: (v: string | null) => v ?? '—' },
              { title: 'Qty', key: 'q', align: 'right', render: (_, l) => (l.quantity ? `${l.quantity} ${l.uqc}` : 'Value only') },
              { title: 'Taxable', dataIndex: 'taxableValue', align: 'right', render: (v: number) => formatCurrency(v) },
              { title: 'GST %', dataIndex: 'gstRatePercent', align: 'right' },
              { title: 'Tax', key: 't', align: 'right', render: (_, l) => formatCurrency(l.cgstAmount + l.sgstAmount + l.igstAmount) },
              { title: 'Total', dataIndex: 'lineTotal', align: 'right', render: (v: number) => formatCurrency(v) },
            ]}
          />
          <Descriptions size="small" column={1} bordered style={{ maxWidth: 340, marginLeft: 'auto' }}>
            <Descriptions.Item label="Taxable value">{formatCurrency(n.taxableTotal)}</Descriptions.Item>
            {n.isInterState
              ? <Descriptions.Item label="IGST">{formatCurrency(n.igstTotal)}</Descriptions.Item>
              : <>
                  <Descriptions.Item label="CGST">{formatCurrency(n.cgstTotal)}</Descriptions.Item>
                  <Descriptions.Item label="SGST">{formatCurrency(n.sgstTotal)}</Descriptions.Item>
                </>}
            <Descriptions.Item label={<b>Credit total</b>}><b>{formatCurrency(n.grandTotal)}</b></Descriptions.Item>
          </Descriptions>
        </Space>
      ) : null}
      {n ? (
        <Modal
          open={cancelOpen}
          title={`Cancel ${n.noteNumber}?`}
          okText="Cancel credit note"
          okButtonProps={{ danger: true, loading: cancel.isPending, disabled: remark.trim().length < 3 }}
          cancelText="Keep it"
          onCancel={() => setCancelOpen(false)}
          onOk={async () => {
            try {
              await cancel.mutateAsync({ id: n.id, remark: remark.trim() });
              message.success('Credit note cancelled');
              setCancelOpen(false);
            } catch (e) {
              message.error(apiErrorMessage(e, 'Could not cancel'), 8);
            }
          }}
        >
          <Typography.Paragraph type="secondary">
            Only possible in the month it was issued (before it is reported) and, with an IRN, within 24 hours. The number is never reused.
          </Typography.Paragraph>
          <Input maxLength={100} placeholder="Why - e.g. issued against the wrong invoice" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Modal>
      ) : null}
    </Drawer>
  );
}

/** The Credit Notes tab of the Tax Invoices screen. */
export function CreditNotesList({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState<CreditNoteReason | undefined>();
  const [supplyType, setSupplyType] = useState<'B2B' | 'B2C' | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [branchId, setBranchId] = useState<string | undefined>();
  const [page, setPage] = useState({ page: 1, limit: 20 });
  const query = { search: search || undefined, reason, supplyType, branchId, from: toIsoDay(range?.[0]), to: toIsoDay(range?.[1]), ...page };
  const q = useQuery({ queryKey: keys.list(query), queryFn: () => creditNotesApi.list(query), placeholderData: keepPreviousData });

  const columns: ColumnsType<CreditNoteRow> = [
    { title: 'Credit note', key: 'n', render: (_, r) => <div><a onClick={() => onOpen(r.id)} style={{ fontWeight: 600 }}>{r.noteNumber}</a><div><Text type="secondary" style={{ fontSize: 12 }}>{formatDate(r.noteDate)}</Text></div></div> },
    { title: 'Against', key: 'inv', render: (_, r) => <div>{r.invoice.invoiceNumber}<div><Text type="secondary" style={{ fontSize: 12 }}>{r.invoice.order?.orderNumber ?? r.invoice.posSale?.saleNumber ?? ''}</Text></div></div> },
    { title: 'Customer', key: 'c', render: (_, r) => <div>{r.customer?.name ?? r.buyer.legalName}<div><Text type="secondary" style={{ fontSize: 12 }}>{r.buyer.gstin ?? 'Unregistered'}</Text></div></div> },
    { title: 'Reason', key: 'r', render: (_, r) => <div>{r.reasonLabel}{r.returnRequest ? <div><Text type="secondary" style={{ fontSize: 12 }}>{r.returnRequest.requestNumber}</Text></div> : null}</div> },
    { title: 'Type', dataIndex: 'supplyType', render: (t: string) => <Tag style={{ margin: 0 }}>{t}</Tag> },
    { title: 'Taxable', dataIndex: 'taxableTotal', align: 'right', render: (v: number) => formatCurrency(v) },
    { title: 'GST', dataIndex: 'taxTotal', align: 'right', render: (v: number) => formatCurrency(v) },
    { title: 'Total', dataIndex: 'grandTotal', align: 'right', render: (v: number) => <Text strong>{formatCurrency(v)}</Text> },
    { title: 'E-invoice', key: 'e', render: (_, r) => (r.status === 'CANCELLED' ? <Tag color="red" style={{ margin: 0 }}>Cancelled</Tag> : <EInvoiceTag status={r.eInvoiceStatus} error={r.eInvoiceError} />) },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" style={{ borderRadius: 10 }}>
        <Space wrap size={12}>
          <Input.Search allowClear placeholder="Note, invoice, order or customer" onSearch={(v) => { setSearch(v.trim()); setPage((p) => ({ ...p, page: 1 })); }} style={{ width: 280 }} />
          <DatePicker.RangePicker value={range} onChange={(v) => { setRange(v); setPage((p) => ({ ...p, page: 1 })); }} />
          <Select allowClear placeholder="Reason" style={{ width: 200 }} value={reason} onChange={setReason}
            options={(Object.keys(CREDIT_NOTE_REASON_LABEL) as CreditNoteReason[]).map((k) => ({ value: k, label: CREDIT_NOTE_REASON_LABEL[k] }))} />
          <Select allowClear placeholder="B2B / B2C" style={{ width: 130 }} value={supplyType} onChange={setSupplyType}
            options={[{ value: 'B2B', label: 'B2B' }, { value: 'B2C', label: 'B2C' }]} />
          {user?.role === 'SUPER_ADMIN' ? <BranchSelect allowClear placeholder="All branches" value={branchId} onChange={setBranchId} style={{ width: 200 }} /> : null}
          <Link to="/gst-returns"><Button icon={<FileExcelOutlined />}>GSTR-1</Button></Link>
        </Space>
      </Card>
      <DataTable<CreditNoteRow>
        rows={q.data?.data}
        meta={q.data?.meta}
        onPageChange={(p, limit) => setPage({ page: p, limit })}
        columns={columns}
        rowKey="id"
        isLoading={q.isLoading}
        isFetching={q.isFetching}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyText="No credit notes yet - returns get one when their refund is completed"
      />
    </Space>
  );
}
