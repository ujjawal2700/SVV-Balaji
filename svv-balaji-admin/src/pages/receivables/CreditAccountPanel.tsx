import { DollarOutlined, StopOutlined } from '@ant-design/icons';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import {
  AGEING_LABEL,
  PAYMENT_TERMS_LABEL,
  RECEIPT_METHOD_LABEL,
  type AgeingBucket,
  type CreditAccount,
  type CreditBill,
  type CreditReceipt,
  type ReceiptMethod,
  type StatementLine,
} from '@shared/api/receivables';
import { useCan } from '@shared/auth/useCan';
import { useCreditAccount, useRecordReceipt, useVoidReceipt } from '@shared/hooks/useReceivables';

const { Text } = Typography;

export const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—');

export const BUCKET_COLOUR: Record<AgeingBucket, string> = {
  NOT_DUE: '#64748b',
  D1_30: '#d97706',
  D31_60: '#ea580c',
  D61_90: '#dc2626',
  D90_PLUS: '#991b1b',
};

/**
 * One B2B customer's credit account: position, ageing, open bills with due
 * dates, payments received (record / void), and the statement of account.
 */
export function CreditAccountPanel({ customerId }: { customerId: string }) {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const account = useCreditAccount(
    customerId,
    range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : {},
  );
  const canRecord = useCan('RECEIVABLES_RECORD');
  const [recordOpen, setRecordOpen] = useState(false);

  if (account.isLoading) return <Card loading style={{ borderRadius: 12 }} />;
  if (account.error || !account.data) {
    return <Alert type="error" showIcon message={apiErrorMessage(account.error, 'Could not load the credit account')} />;
  }
  const a = account.data;
  const { summary, terms } = a;
  const onCredit = terms.paymentTerms !== 'PREPAID';

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* Terms + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Space size={8} wrap>
          <Tag color="blue" style={{ margin: 0 }}>{PAYMENT_TERMS_LABEL[terms.paymentTerms]}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Limit {terms.creditLimit === null ? 'not set' : inr(terms.creditLimit)} · credit period counts from{' '}
            {terms.creditPeriodStart === 'DISPATCH' ? 'dispatch' : 'order date'}
          </Text>
        </Space>
        {canRecord && summary.outstanding > 0 ? (
          <Button type="primary" icon={<DollarOutlined />} onClick={() => setRecordOpen(true)}>
            Record payment
          </Button>
        ) : null}
      </div>

      {!onCredit && summary.outstanding === 0 ? (
        <Alert type="info" showIcon message="This customer is on prepaid terms. Set payment terms and a credit limit to trade on credit." />
      ) : null}
      {summary.overLimit ? (
        <Alert type="error" showIcon message={`Over the credit limit by ${inr(summary.outstanding - (terms.creditLimit ?? 0))}. New credit orders will be refused.`} />
      ) : null}

      {/* Position */}
      <Row gutter={[12, 12]}>
        <Tile label="Outstanding" value={inr(summary.outstanding)} hint={`${summary.openBills} open bill${summary.openBills === 1 ? '' : 's'}`} />
        <Tile
          label="Overdue"
          value={inr(summary.overdue)}
          tone={summary.overdue > 0 ? '#dc2626' : undefined}
          hint={summary.overdueBills ? `${summary.overdueBills} bill${summary.overdueBills === 1 ? '' : 's'} · oldest ${summary.oldestOverdueDays} days` : 'Nothing overdue'}
        />
        <Tile
          label="Available credit"
          value={summary.availableCredit === null ? 'No limit set' : inr(summary.availableCredit)}
          tone={summary.availableCredit === 0 ? '#dc2626' : '#059669'}
        />
        <Tile
          label="Next due"
          value={summary.nextDue ? day(summary.nextDue.dueDate) : '—'}
          hint={summary.nextDue ? `${inr(summary.nextDue.amount)} · ${summary.nextDue.orderNumber}` : undefined}
        />
      </Row>

      <AgeingBar ageing={a.ageing} total={summary.outstanding} />

      <Tabs
        size="small"
        items={[
          { key: 'bills', label: `Open bills (${a.openBills.length})`, children: <BillsTable bills={a.openBills} /> },
          {
            key: 'statement',
            label: 'Statement of account',
            children: <StatementView account={a} range={range} onRange={setRange} loading={account.isFetching} />,
          },
          {
            key: 'receipts',
            label: `Payments received (${a.receipts.filter((r) => !r.voided).length})`,
            children: <ReceiptsTable receipts={a.receipts} canVoid={canRecord} />,
          },
        ]}
      />

      <RecordPaymentModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        customerId={customerId}
        outstanding={summary.outstanding}
        bills={a.openBills}
      />
    </Space>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ borderRadius: 12, height: '100%' }} styles={{ body: { padding: '12px 14px' } }}>
        <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
        <div style={{ fontSize: 20, fontWeight: 700, color: tone ?? '#0f172a', lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {hint ? <Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text> : null}
      </Card>
    </Col>
  );
}

export function AgeingBar({ ageing, total }: { ageing: CreditAccount['ageing']; total: number }) {
  if (total <= 0) return null;
  const keys = Object.keys(ageing) as AgeingBucket[];
  return (
    <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: '12px 14px' } }}>
      <Text strong style={{ fontSize: 13 }}>Ageing</Text>
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', margin: '10px 0', background: '#f1f5f9' }}>
        {keys.map((k) =>
          ageing[k] > 0 ? (
            <Tooltip key={k} title={`${AGEING_LABEL[k]}: ${inr(ageing[k])}`}>
              <div style={{ width: `${(ageing[k] / total) * 100}%`, background: BUCKET_COLOUR[k] }} />
            </Tooltip>
          ) : null,
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
        {keys.map((k) => (
          <span key={k} style={{ fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: BUCKET_COLOUR[k] }} />
            {AGEING_LABEL[k]} <strong style={{ color: '#0f172a' }}>{inr(ageing[k])}</strong>
          </span>
        ))}
      </div>
    </Card>
  );
}

function BillsTable({ bills }: { bills: CreditBill[] }) {
  if (bills.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No unpaid credit bills" />;
  return (
    <Table<CreditBill>
      size="small"
      rowKey="orderId"
      dataSource={bills}
      pagination={bills.length > 15 ? { pageSize: 15 } : false}
      scroll={{ x: 760 }}
      columns={[
        { title: 'Order', dataIndex: 'orderNumber', render: (v: string) => <Text code>{v}</Text> },
        { title: 'Ordered', dataIndex: 'orderDate', render: day },
        { title: 'Dispatched', dataIndex: 'dispatchedAt', render: day },
        {
          title: 'Due',
          key: 'due',
          render: (_, b) =>
            b.dueDate ? (
              <Space size={6}>
                {day(b.dueDate)}
                {b.overdue ? <Tag color="red" style={{ margin: 0 }}>{b.overdueDays}d overdue</Tag> : null}
              </Space>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>{b.dueNote ?? '—'}</Text>
            ),
        },
        { title: 'Bill', dataIndex: 'total', align: 'right', render: (v: number) => inr(v) },
        { title: 'Paid', dataIndex: 'amountPaid', align: 'right', render: (v: number) => (v > 0 ? inr(v) : '—') },
        {
          title: 'Outstanding',
          dataIndex: 'outstanding',
          align: 'right',
          render: (v: number, b) => <Text strong type={b.overdue ? 'danger' : undefined}>{inr(v)}</Text>,
        },
      ]}
    />
  );
}

function StatementView({
  account,
  range,
  onRange,
  loading,
}: {
  account: CreditAccount;
  range: [Dayjs, Dayjs] | null;
  onRange: (r: [Dayjs, Dayjs] | null) => void;
  loading: boolean;
}) {
  const st = account.statement;
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <DatePicker.RangePicker
          value={range}
          onChange={(v) => onRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
          allowClear
          format="D MMM YYYY"
        />
        <Space size={16} wrap>
          <Text type="secondary">Opening <Text strong>{inr(st.openingBalance)}</Text></Text>
          <Text type="secondary">Billed <Text strong>{inr(st.totals.debit)}</Text></Text>
          <Text type="secondary">Received <Text strong>{inr(st.totals.credit)}</Text></Text>
          <Text type="secondary">Closing <Text strong>{inr(st.closingBalance)}</Text></Text>
        </Space>
      </div>
      <Table<StatementLine>
        size="small"
        loading={loading}
        rowKey={(l, i) => `${l.reference}-${l.kind}-${i}`}
        dataSource={st.lines}
        pagination={st.lines.length > 25 ? { pageSize: 25 } : false}
        scroll={{ x: 720 }}
        locale={{ emptyText: 'No entries in this period' }}
        columns={[
          { title: 'Date', dataIndex: 'date', render: day, width: 120 },
          { title: 'Reference', dataIndex: 'reference', render: (v: string) => <Text code>{v}</Text> },
          { title: 'Details', dataIndex: 'description' },
          { title: 'Debit', dataIndex: 'debit', align: 'right', render: (v: number) => (v ? inr(v) : '') },
          { title: 'Credit', dataIndex: 'credit', align: 'right', render: (v: number) => (v ? <Text type="success">{inr(v)}</Text> : '') },
          { title: 'Balance', dataIndex: 'balance', align: 'right', render: (v: number) => <Text strong>{inr(v)}</Text> },
        ]}
      />
    </Space>
  );
}

function ReceiptsTable({ receipts, canVoid }: { receipts: CreditReceipt[]; canVoid: boolean }) {
  const { message, modal } = AntApp.useApp();
  const voidReceipt = useVoidReceipt();

  const askVoid = (r: CreditReceipt) => {
    let reason = '';
    modal.confirm({
      title: `Void ${r.receiptNumber}?`,
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">
            {inr(r.amount)} comes back off {r.appliedTo.map((x) => x.orderNumber).join(', ')}. The receipt stays on record as void.
          </Text>
          <Input.TextArea rows={2} placeholder="Reason (required)" onChange={(e) => (reason = e.target.value)} />
        </Space>
      ),
      okText: 'Void receipt',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (reason.trim().length < 3) {
          message.error('Give a reason for voiding');
          throw new Error('reason required');
        }
        try {
          await voidReceipt.mutateAsync({ id: r.id, reason });
          message.success(`${r.receiptNumber} voided`);
        } catch (e) {
          message.error(apiErrorMessage(e, 'Could not void the receipt'));
          throw e;
        }
      },
    });
  };

  if (receipts.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments recorded yet" />;
  return (
    <Table<CreditReceipt>
      size="small"
      rowKey="id"
      dataSource={receipts}
      pagination={receipts.length > 15 ? { pageSize: 15 } : false}
      scroll={{ x: 820 }}
      rowClassName={(r) => (r.voided ? 'receipt-voided' : '')}
      columns={[
        {
          title: 'Receipt',
          dataIndex: 'receiptNumber',
          render: (v: string, r) => (
            <Space size={6}>
              <Text code delete={r.voided}>{v}</Text>
              {r.voided ? <Tooltip title={r.voidReason}><Tag style={{ margin: 0 }}>Void</Tag></Tooltip> : null}
            </Space>
          ),
        },
        { title: 'Received', dataIndex: 'receivedOn', render: day },
        { title: 'Method', dataIndex: 'method', render: (m: ReceiptMethod, r) => `${RECEIPT_METHOD_LABEL[m]}${r.reference ? ` · ${r.reference}` : ''}` },
        { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v: number, r) => <Text strong delete={r.voided}>{inr(v)}</Text> },
        {
          title: 'Applied to',
          key: 'applied',
          render: (_, r) =>
            r.voided ? <Text type="secondary" style={{ fontSize: 12 }}>—</Text> : r.appliedTo.map((x) => `${x.orderNumber} (${inr(x.amount)})`).join(', '),
        },
        { title: 'Recorded by', key: 'by', render: (_, r) => r.recordedBy?.fullName ?? '—' },
        {
          title: '',
          key: 'actions',
          width: 80,
          render: (_, r) =>
            canVoid && !r.voided ? (
              <Button size="small" danger type="text" icon={<StopOutlined />} onClick={() => askVoid(r)}>
                Void
              </Button>
            ) : null,
        },
      ]}
    />
  );
}

interface PaymentForm {
  amount: number;
  method: ReceiptMethod;
  reference?: string;
  receivedOn: Dayjs;
  note?: string;
}

function RecordPaymentModal({
  open,
  onClose,
  customerId,
  outstanding,
  bills,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  outstanding: number;
  bills: CreditBill[];
}) {
  const [form] = Form.useForm<PaymentForm>();
  const { message } = AntApp.useApp();
  const record = useRecordReceipt(customerId);
  const amount = Form.useWatch('amount', form) ?? 0;

  // Preview the oldest-due-first allocation the server will make.
  const preview = (() => {
    const ordered = [...bills].sort((x, y) => {
      if (x.dueDate && y.dueDate) return x.dueDate.localeCompare(y.dueDate) || x.orderDate.localeCompare(y.orderDate);
      if (x.dueDate) return -1;
      if (y.dueDate) return 1;
      return x.orderDate.localeCompare(y.orderDate);
    });
    let left = Math.round(Number(amount) * 100) / 100;
    const out: Array<{ orderNumber: string; amount: number; clears: boolean }> = [];
    for (const b of ordered) {
      if (left <= 0) break;
      const take = Math.min(b.outstanding, left);
      out.push({ orderNumber: b.orderNumber, amount: take, clears: take >= b.outstanding });
      left = Math.round((left - take) * 100) / 100;
    }
    return out;
  })();

  const submit = async () => {
    const v = await form.validateFields();
    try {
      const r = await record.mutateAsync({
        amount: v.amount,
        method: v.method,
        reference: v.reference,
        receivedOn: v.receivedOn.format('YYYY-MM-DD'),
        note: v.note,
      });
      message.success(`${r.receiptNumber} recorded — applied to ${r.appliedTo.map((x) => x.orderNumber).join(', ')}`);
      form.resetFields();
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not record the payment'));
    }
  };

  return (
    <Modal
      open={open}
      title="Record payment received"
      okText="Record payment"
      onOk={submit}
      onCancel={onClose}
      confirmLoading={record.isPending}
      destroyOnClose
      width={560}
    >
      <Form form={form} layout="vertical" initialValues={{ method: 'UPI', receivedOn: dayjs() }} preserve={false}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="amount"
              label={`Amount (outstanding ${inr(outstanding)})`}
              rules={[
                { required: true, message: 'Enter the amount received' },
                { type: 'number', min: 0.01, message: 'Must be more than zero' },
                { type: 'number', max: outstanding, message: 'More than is owed' },
              ]}
            >
              <InputNumber style={{ width: '100%' }} prefix="₹" precision={2} min={0} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="receivedOn" label="Received on" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="D MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="method" label="Method" rules={[{ required: true }]}>
              <Select options={Object.entries(RECEIPT_METHOD_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="reference" label="Reference (UTR / cheque no.)">
              <Input maxLength={120} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>

      {preview.length ? (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Will be applied, oldest due first:</Text>
          {preview.map((p) => (
            <div key={p.orderNumber} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
              <span>
                <Text code>{p.orderNumber}</Text> {p.clears ? <Tag color="green" style={{ marginLeft: 4 }}>Clears</Tag> : <Tag style={{ marginLeft: 4 }}>Part</Tag>}
              </span>
              <strong>{inr(p.amount)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
