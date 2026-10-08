import { CheckCircleOutlined, StopOutlined, WalletOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, App as AntApp, Button, Card, Col, DatePicker, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tabs, Tag, Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { EARNING_TYPE_LABEL } from '@shared/api/delivery';
import {
  PAYOUT_METHOD_LABEL,
  riderPayoutsApi,
  type PayoutDueRow,
  type PayoutLine,
  type RecordPayoutInput,
  type RiderPayout,
  type RiderPayoutMethod,
} from '@shared/api/riderPayouts';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { StatCard } from '../../customers/detailPageParts';
import { OutletSelect, RiderCell, inr } from './riderParts';

const { Text } = Typography;
const KEY = ['riderPayouts'] as const;

const lineColumns = [
  { title: 'Earned', dataIndex: 'earnedAt', render: (v: string) => dayjs(v).format('D MMM, HH:mm') },
  { title: 'Type', dataIndex: 'type', render: (t: string) => EARNING_TYPE_LABEL[t] ?? t },
  { title: 'Task / order', key: 't', render: (_: unknown, l: PayoutLine) => [l.taskNumber, l.orderNumber].filter(Boolean).join(' · ') || l.note || '—' },
  { title: 'Amount', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <Text type={v < 0 ? 'danger' : undefined}>{inr(v)}</Text> },
];

/**
 * Rider Payouts (`/riders/payouts`): who is owed what, settle it once the money
 * has gone out, and the history of what was paid. Earnings themselves accrue
 * per delivery on Rider Earnings.
 */
export function RiderPayoutsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'due';
  const openId = params.get('payout') ?? undefined;
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next, { replace: true });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader
        title="Rider Payouts"
        subtitle="Settle rider pay once you have paid it - by bank, UPI or cash - and keep COD cash a rider holds against it if you choose."
      />
      <Tabs
        activeKey={tab}
        onChange={(k) => set({ tab: k === 'history' ? k : undefined })}
        items={[
          { key: 'due', label: 'Pay due', children: <DueTab onOpenPayout={(id) => set({ payout: id })} /> },
          { key: 'history', label: 'Payouts made', children: <HistoryTab onOpen={(id) => set({ payout: id })} /> },
        ]}
      />
      <PayoutDrawer id={openId} onClose={() => set({ payout: undefined })} />
    </Space>
  );
}

function DueTab({ onOpenPayout }: { onOpenPayout: (id: string) => void }) {
  const navigate = useNavigate();
  const canPay = useCan('RIDER_PAYOUTS_RECORD');
  const [upTo, setUpTo] = useState<Dayjs>(dayjs().subtract(1, 'day'));
  const [outlet, setOutlet] = useState<string | undefined>();
  const [paying, setPaying] = useState<PayoutDueRow | null>(null);
  const day = upTo.format('YYYY-MM-DD');
  const q = useQuery({ queryKey: [...KEY, 'due', day, outlet], queryFn: () => riderPayoutsApi.due({ upTo: day, warehouseId: outlet }), placeholderData: keepPreviousData });
  const d = q.data;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" className="page-card">
        <Space wrap>
          <Text>Earned up to the end of</Text>
          <DatePicker value={upTo} allowClear={false} disabledDate={(dt) => dt.isAfter(dayjs(), 'day')} onChange={(v) => v && setUpTo(v)} />
          <OutletSelect allowClear placeholder="All outlets" value={outlet} onChange={setOutlet} style={{ width: 180 }} />
        </Space>
      </Card>
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><StatCard icon={<WalletOutlined />} tone="amber" label="Owed to riders" value={inr(d?.totals.owed ?? 0)} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<CheckCircleOutlined />} tone="blue" label="Riders to pay" value={d?.totals.riders ?? 0} /></Col>
      </Row>
      {q.error ? <Alert type="error" showIcon message={apiErrorMessage(q.error, 'Could not load')} /> : null}
      <Card className="page-card">
        <Table<PayoutDueRow>
          rowKey={(r) => r.rider.id}
          loading={q.isLoading}
          dataSource={d?.rows ?? []}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description="Nobody is owed anything up to this date" /> }}
          columns={[
            { title: 'Rider', key: 'r', render: (_, r) => <RiderCell rider={r.rider} sub={[r.rider.code, r.rider.warehouse?.name].filter(Boolean).join(' · ')} onOpen={() => navigate(`/riders/${r.rider.id}?tab=earnings`)} /> },
            { title: 'Unpaid lines', dataIndex: 'lines', align: 'right' },
            { title: 'Unpaid since', dataIndex: 'oldestUnpaid', render: (v: string | null) => (v ? dayjs(v).format('D MMM YYYY') : '—') },
            { title: 'Last paid', dataIndex: 'lastPaidAt', render: (v: string | null) => (v ? dayjs(v).format('D MMM YYYY') : 'Never') },
            { title: 'COD cash held', dataIndex: 'cashHeld', align: 'right', render: (v: number) => (v > 0 ? <Text type="warning">{inr(v)}</Text> : inr(v)) },
            { title: 'Owed', dataIndex: 'owed', align: 'right', render: (v: number) => <Text strong type={v <= 0 ? 'secondary' : undefined}>{inr(v)}</Text> },
            {
              title: '', key: 'a', fixed: 'right', width: 110,
              render: (_, r) => (canPay && r.owed > 0 ? <Button type="primary" size="small" onClick={() => setPaying(r)}>Pay</Button> : null),
            },
          ]}
        />
      </Card>
      <PayModal row={paying} upTo={day} onClose={() => setPaying(null)} onPaid={(id) => { setPaying(null); onOpenPayout(id); }} />
    </Space>
  );
}

function PayModal({ row, upTo, onClose, onPaid }: { row: PayoutDueRow | null; upTo: string; onClose: () => void; onPaid: (id: string) => void }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<RecordPayoutInput & { keepCash: number | null }>();
  const method = Form.useWatch('method', form);
  const keep = Form.useWatch('keepCash', form) ?? 0;
  const preview = useQuery({
    queryKey: [...KEY, 'preview', row?.rider.id, upTo],
    queryFn: () => riderPayoutsApi.preview(row!.rider.id, upTo),
    enabled: Boolean(row),
  });
  useEffect(() => { if (row) form.resetFields(); }, [row, form]);
  const record = useMutation({
    mutationFn: (input: RecordPayoutInput) => riderPayoutsApi.record(row!.rider.id, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
  const p = preview.data;

  return (
    <Modal
      open={Boolean(row)}
      width={760}
      title={row ? `Pay ${row.rider.fullName}` : 'Pay'}
      okText={p ? `Record ${inr(Math.max(0, p.gross - (keep || 0)))} paid` : 'Record'}
      okButtonProps={{ loading: record.isPending, disabled: !p || p.gross <= 0 }}
      onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          const out = await record.mutateAsync({ upTo, method: v.method, reference: v.reference?.trim() || undefined, note: v.note?.trim() || undefined, cashOffset: v.keepCash || undefined });
          message.success(`${out.payoutNumber} recorded`);
          onPaid(out.id);
        } catch (e) {
          message.error(apiErrorMessage(e, 'Could not record the payout'), 8);
        }
      }}
    >
      {preview.error ? <Alert type="error" showIcon message={apiErrorMessage(preview.error, 'Could not load what is owed')} /> : null}
      {p ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            Every unpaid line earned up to the end of {dayjs(upTo).format('D MMM YYYY')}. Record this after the money has gone out.
          </Text>
          <Table size="small" rowKey="id" pagination={p.lines.length > 8 ? { pageSize: 8 } : false} dataSource={p.lines} columns={lineColumns} />
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Owed">{inr(p.gross)}</Descriptions.Item>
            <Descriptions.Item label="COD cash the rider holds">{inr(p.cashHeld)}</Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical" initialValues={{ method: 'UPI', keepCash: null }}>
            <Row gutter={12}>
              <Col xs={24} sm={12}>
                <Form.Item name="method" label="Paid by" rules={[{ required: true }]}>
                  <Select options={(Object.keys(PAYOUT_METHOD_LABEL) as RiderPayoutMethod[]).map((k) => ({ value: k, label: PAYOUT_METHOD_LABEL[k] }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="reference"
                  label="Reference (UTR / UPI)"
                  rules={[{ required: method !== 'CASH', message: 'Needed for bank and UPI payments' }]}
                >
                  <Input maxLength={80} placeholder={method === 'CASH' ? 'Optional' : 'e.g. 4321XXXX9876'} />
                </Form.Item>
              </Col>
            </Row>
            {p.maxCashOffset > 0 ? (
              <Form.Item
                name="keepCash"
                label={`Let the rider keep COD cash against this pay (up to ${inr(p.maxCashOffset)})`}
                extra="Lowers what you pay and the cash the rider has to hand in, by the same amount."
              >
                <InputNumber min={0} max={p.maxCashOffset} precision={2} prefix="₹" style={{ width: 200 }} />
              </Form.Item>
            ) : null}
            <Form.Item name="note" label="Note">
              <Input maxLength={300} />
            </Form.Item>
          </Form>
        </Space>
      ) : preview.isLoading ? <Text type="secondary">Loading…</Text> : null}
    </Modal>
  );
}

function HistoryTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [status, setStatus] = useState<'PAID' | 'VOIDED' | undefined>();
  const [page, setPage] = useState(1);
  const query = { status, page, limit: 20, ...(range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : {}) };
  const q = useQuery({ queryKey: [...KEY, 'list', query], queryFn: () => riderPayoutsApi.list(query), placeholderData: keepPreviousData });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" className="page-card">
        <Space wrap>
          <DatePicker.RangePicker value={range} onChange={(v) => { setRange(v && v[0] && v[1] ? [v[0], v[1]] : null); setPage(1); }} />
          <Select allowClear placeholder="Status" style={{ width: 140 }} value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            options={[{ value: 'PAID', label: 'Paid' }, { value: 'VOIDED', label: 'Voided' }]} />
          {q.data ? (
            <Text type="secondary">
              Paid {inr(q.data.summary.netPaid)}{q.data.summary.cashOffset ? ` + ${inr(q.data.summary.cashOffset)} COD cash kept` : ''}
            </Text>
          ) : null}
        </Space>
      </Card>
      <Card className="page-card">
        <Table<RiderPayout>
          rowKey="id"
          loading={q.isLoading}
          dataSource={q.data?.data ?? []}
          scroll={{ x: 900 }}
          pagination={{ current: page, pageSize: 20, total: q.data?.meta.total ?? 0, onChange: setPage, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="No payouts recorded yet" /> }}
          columns={[
            { title: 'Payout', key: 'n', render: (_, r) => <div><a onClick={() => onOpen(r.id)} style={{ fontWeight: 600 }}>{r.payoutNumber}</a><div><Text type="secondary" style={{ fontSize: 12 }}>{dayjs(r.paidAt).format('D MMM YYYY, HH:mm')}</Text></div></div> },
            { title: 'Rider', key: 'r', render: (_, r) => <div>{r.rider.fullName}<div><Text type="secondary" style={{ fontSize: 12 }}>{r.rider.code ?? r.rider.phone}</Text></div></div> },
            { title: 'Earned up to', dataIndex: 'upTo', render: (v: string) => dayjs(v).subtract(1, 'minute').format('D MMM YYYY') },
            { title: 'Lines', dataIndex: 'lineCount', align: 'right' },
            { title: 'Owed', dataIndex: 'grossAmount', align: 'right', render: (v: number) => inr(v) },
            { title: 'Cash kept', dataIndex: 'cashOffset', align: 'right', render: (v: number) => (v ? inr(v) : '—') },
            { title: 'Paid', dataIndex: 'netPaid', align: 'right', render: (v: number) => <Text strong>{inr(v)}</Text> },
            { title: 'How', key: 'm', render: (_, r) => <div>{PAYOUT_METHOD_LABEL[r.method]}<div><Text type="secondary" style={{ fontSize: 12 }}>{r.reference ?? ''}</Text></div></div> },
            { title: '', dataIndex: 'status', render: (s: string) => (s === 'VOIDED' ? <Tag color="red">Voided</Tag> : <Tag color="green">Paid</Tag>) },
          ]}
        />
      </Card>
    </Space>
  );
}

function PayoutDrawer({ id, onClose }: { id?: string; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const canPay = useCan('RIDER_PAYOUTS_RECORD');
  const q = useQuery({ queryKey: [...KEY, 'one', id], queryFn: () => riderPayoutsApi.get(id!), enabled: Boolean(id) });
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const voidIt = useMutation({ mutationFn: () => riderPayoutsApi.void(id!, reason.trim()), onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }) });
  const p = q.data;

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      width={Math.min(720, window.innerWidth)}
      title={p ? `Payout ${p.payoutNumber}` : 'Payout'}
      extra={p && p.status === 'PAID' && canPay ? <Button danger icon={<StopOutlined />} onClick={() => setVoiding(true)}>Void</Button> : null}
    >
      {p ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {p.status === 'VOIDED' ? (
            <Alert type="error" showIcon message={`Voided ${dayjs(p.voidedAt).format('D MMM YYYY, HH:mm')}${p.voidedBy ? ` by ${p.voidedBy.fullName}` : ''}`} description={p.voidReason} />
          ) : null}
          <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
            <Descriptions.Item label="Rider">{p.rider.fullName} ({p.rider.code ?? p.rider.phone})</Descriptions.Item>
            <Descriptions.Item label="Paid on">{dayjs(p.paidAt).format('D MMM YYYY, HH:mm')}</Descriptions.Item>
            <Descriptions.Item label="Earned up to">{dayjs(p.upTo).subtract(1, 'minute').format('D MMM YYYY')}</Descriptions.Item>
            <Descriptions.Item label="How">{PAYOUT_METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ''}</Descriptions.Item>
            <Descriptions.Item label="Owed">{inr(p.grossAmount)}</Descriptions.Item>
            <Descriptions.Item label="COD cash kept">{inr(p.cashOffset)}</Descriptions.Item>
            <Descriptions.Item label="Paid"><b>{inr(p.netPaid)}</b></Descriptions.Item>
            <Descriptions.Item label="Recorded by">{p.recordedBy.fullName}</Descriptions.Item>
            {p.note ? <Descriptions.Item label="Note" span={2}>{p.note}</Descriptions.Item> : null}
          </Descriptions>
          <Table size="small" rowKey="id" pagination={false} dataSource={p.earnings ?? []} columns={lineColumns} />
        </Space>
      ) : null}
      <Modal
        open={voiding}
        title={p ? `Void ${p.payoutNumber}?` : 'Void'}
        okText="Void payout"
        okButtonProps={{ danger: true, loading: voidIt.isPending, disabled: reason.trim().length < 3 }}
        onCancel={() => setVoiding(false)}
        onOk={async () => {
          try {
            await voidIt.mutateAsync();
            message.success('Payout voided - its lines are owed again');
            setVoiding(false);
          } catch (e) {
            message.error(apiErrorMessage(e, 'Could not void'), 8);
          }
        }}
      >
        <Typography.Paragraph type="secondary">
          Only for a payout recorded in error. The lines become owed again, and any COD cash set off goes back on the rider&apos;s cash held.
          If money really went out, do not void - pay less next time with an adjustment instead.
        </Typography.Paragraph>
        <Input maxLength={300} placeholder="Why" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </Drawer>
  );
}
