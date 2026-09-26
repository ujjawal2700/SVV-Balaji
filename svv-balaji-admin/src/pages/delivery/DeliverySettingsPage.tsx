import { DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert, App as AntApp, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tabs, Tag, TimePicker, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { deliveryApi, type EarningRule, type EarningRuleKind, type FailureReason } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useDeliveryMutation, useDeliverySettings, useEarningRules, useFailureReasons, useZones } from '@shared/hooks/useDelivery';

const KIND: Record<EarningRuleKind, { label: string; help: string }> = {
  BASE_PER_DELIVERY: { label: 'Base pay per delivery', help: 'Flat amount for every successful delivery.' },
  DISTANCE_SLAB: { label: 'Distance slabs', help: 'Amount by outlet-to-customer distance, per successful delivery.' },
  PEAK_HOUR: { label: 'Peak-hour incentive', help: 'Extra per delivery completed inside the time windows.' },
  ZONE_INCENTIVE: { label: 'Zone / high-demand incentive', help: 'Extra per delivery in one zone, optionally only at set times.' },
  DAILY_TARGET: { label: 'Daily target bonus', help: 'One-off bonus when a rider reaches N deliveries in a day.' },
  WEEKLY_TARGET: { label: 'Weekly target bonus', help: 'One-off bonus when a rider reaches N deliveries in a week (Mon-Sun).' },
  WAITING_TIME: { label: 'Waiting-time pay', help: 'Pay for waiting beyond a free allowance - only when arrival was location-verified.' },
  OUTCOME_COMPENSATION: { label: 'Cancelled / failed trip pay', help: 'What a cancelled or failed trip pays. With no rule it pays nothing.' },
};
const OUTCOMES: Record<string, string> = {
  CANCELLED_AFTER_ASSIGNMENT: 'Cancelled after the rider accepted', CANCELLED_AT_PICKUP: 'Cancelled with the rider at the store',
  CANCELLED_AFTER_PICKUP: 'Cancelled after pickup', FAILED_CUSTOMER_UNAVAILABLE: 'Failed - customer unavailable', FAILED_CUSTOMER_REFUSED: 'Failed - customer refused',
  FAILED_ADDRESS_ISSUE: 'Failed - address problem', FAILED_RIDER_ISSUE: 'Failed - rider unable', FAILED_OTHER: 'Failed - other',
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describe(r: EarningRule): string {
  const c = r.config as Record<string, any>;
  switch (r.kind) {
    case 'BASE_PER_DELIVERY': return `₹${c.amount}`;
    case 'DISTANCE_SLAB': return (c.slabs as any[]).map((s, i, a) => `${i ? a[i - 1].uptoKm : 0}${s.uptoKm === null ? '+' : `-${s.uptoKm}`} km ₹${s.amount}`).join(' · ');
    case 'PEAK_HOUR': return `₹${c.amount} · ${(c.windows as any[]).map((w) => `${w.days?.length ? w.days.map((d: number) => DAYS[d]).join('/') : 'daily'} ${w.start}-${w.end}`).join(', ')}`;
    case 'ZONE_INCENTIVE': return `₹${c.amount}${c.windows?.length ? ` at set times` : ''}`;
    case 'DAILY_TARGET':
    case 'WEEKLY_TARGET': return (c.targets as any[]).map((t) => `${t.deliveries} → ₹${t.bonus}`).join(' · ');
    case 'WAITING_TIME': return `${c.at?.toLowerCase()} · after ${c.freeMinutes} min ₹${c.perMinute}/min${c.maxAmount != null ? ` (max ₹${c.maxAmount})` : ''}`;
    case 'OUTCOME_COMPENSATION': return `${OUTCOMES[c.outcome] ?? c.outcome}: ${c.mode === 'FIXED' ? `₹${c.value}` : `${c.value}% of delivery pay`}`;
    default: return '';
  }
}

export function DeliverySettingsPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Delivery Settings" subtitle="How deliveries reach riders and what counts as a failed delivery. Rider pay is under Manage Riders → Pay Rules." />
      <Tabs items={[
        { key: 'dispatch', label: 'Dispatch & COD', children: <Dispatch /> },
        { key: 'reasons', label: 'Failed-delivery reasons', children: <Reasons /> },
      ]} />
    </Space>
  );
}

/** Manage Riders → Pay Rules: every rule that decides what a rider earns. */
export function RiderPayRulesPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Pay Rules" subtitle="Exactly how riders are paid: base, distance slabs, peak hours, zone incentives, daily / weekly targets, waiting time and cancel / fail compensation. Changes apply to deliveries that finish after saving." />
      <PayRules />
    </Space>
  );
}

// ---------------------------------------------------------------- pay rules

function PayRules() {
  const rules = useEarningRules();
  const canManage = useCan('DELIVERY_SETTINGS_MANAGE');
  const [edit, setEdit] = useState<EarningRule | 'new' | null>(null);
  const { message } = AntApp.useApp();
  const remove = useDeliveryMutation((id: string) => deliveryApi.removeRule(id));
  const toggle = useDeliveryMutation(({ id, isActive }: { id: string; isActive: boolean }) => deliveryApi.updateRule(id, { isActive }));
  const columns: ColumnsType<EarningRule> = [
    { title: 'Rule', key: 'n', render: (_, r) => <div><b>{r.name}</b><div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{KIND[r.kind].label}</Typography.Text></div></div> },
    { title: 'Pays', key: 'd', render: (_, r) => describe(r) },
    { title: 'Zone', key: 'z', render: (_, r) => (r.zone ? <Tag>{r.zone.name}</Tag> : <Tag color="blue">All zones</Tag>) },
    { title: 'Valid', key: 'v', render: (_, r) => (r.validFrom || r.validTo ? `${r.validFrom ? dayjs(r.validFrom).format('D MMM') : '…'} – ${r.validTo ? dayjs(r.validTo).format('D MMM') : '…'}` : 'Always') },
    { title: 'On', key: 'a', render: (_, r) => <Switch size="small" checked={r.isActive} disabled={!canManage} onChange={(v) => toggle.mutate({ id: r.id, isActive: v }, { onError: (e) => message.error(apiErrorMessage(e)) })} /> },
    {
      title: '', key: 'x', width: 110,
      render: (_, r) => canManage ? (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEdit(r)} />
          <Popconfirm title="Remove this rule?" description="A rule that already paid riders is switched off instead." onConfirm={() => remove.mutate(r.id, { onSuccess: (x) => message.success(x.deleted ? 'Deleted' : 'Switched off'), onError: (e) => message.error(apiErrorMessage(e)) })}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ) : null,
    },
  ];
  return (
    <Card size="small" style={{ borderRadius: 10 }} extra={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setEdit('new')}>New rule</Button> : null}
      title={<Space direction="vertical" size={0}><span>Rider pay rules</span><Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>A zone's base / distance / outcome rule replaces the all-zones one; incentives add up. A cancelled or failed trip pays only what an outcome rule says.</Typography.Text></Space>}>
      <Table<EarningRule> rowKey="id" columns={columns} dataSource={rules.data ?? []} loading={rules.isLoading} pagination={false} scroll={{ x: 900 }}
        locale={{ emptyText: 'No pay rules - riders earn nothing until you add some.' }} />
      {edit ? <RuleModal rule={edit === 'new' ? null : edit} onClose={() => setEdit(null)} /> : null}
    </Card>
  );
}

type RuleForm = {
  name: string; kind: EarningRuleKind; zoneId?: string | null; validity?: [Dayjs | null, Dayjs | null] | null;
  amount?: number; slabs?: Array<{ uptoKm: number | null; amount: number }>; unknownDistanceAmount?: number;
  windows?: Array<{ days: number[]; time: [Dayjs, Dayjs] }>; targets?: Array<{ deliveries: number; bonus: number }>;
  at?: 'PICKUP' | 'DROP' | 'BOTH'; freeMinutes?: number; perMinute?: number; maxAmount?: number | null;
  outcome?: string; mode?: 'FIXED' | 'PERCENT_OF_DELIVERY'; value?: number;
};

function toForm(r: EarningRule | null): Partial<RuleForm> {
  if (!r) return { kind: 'BASE_PER_DELIVERY', slabs: [{ uptoKm: 1, amount: 20 }, { uptoKm: 2, amount: 25 }, { uptoKm: 3, amount: 30 }, { uptoKm: 5, amount: 35 }], targets: [{ deliveries: 10, bonus: 100 }], windows: [], at: 'BOTH', freeMinutes: 5, perMinute: 1, mode: 'FIXED' };
  const c = r.config as Record<string, any>;
  return {
    name: r.name, kind: r.kind, zoneId: r.zoneId, validity: r.validFrom || r.validTo ? [r.validFrom ? dayjs(r.validFrom) : null, r.validTo ? dayjs(r.validTo) : null] : null,
    amount: c.amount, slabs: c.slabs, unknownDistanceAmount: c.unknownDistanceAmount,
    windows: (c.windows ?? []).map((w: any) => ({ days: w.days ?? [], time: [dayjs(w.start, 'HH:mm'), dayjs(w.end, 'HH:mm')] })),
    targets: c.targets, at: c.at, freeMinutes: c.freeMinutes, perMinute: c.perMinute, maxAmount: c.maxAmount, outcome: c.outcome, mode: c.mode, value: c.value,
  };
}

function toConfig(v: RuleForm): Record<string, unknown> {
  const windows = (v.windows ?? []).map((w) => ({ days: w.days ?? [], start: w.time[0].format('HH:mm'), end: w.time[1].format('HH:mm') }));
  switch (v.kind) {
    case 'BASE_PER_DELIVERY': return { amount: v.amount };
    case 'DISTANCE_SLAB': return { slabs: v.slabs, ...(v.unknownDistanceAmount != null ? { unknownDistanceAmount: v.unknownDistanceAmount } : {}) };
    case 'PEAK_HOUR': return { amount: v.amount, windows };
    case 'ZONE_INCENTIVE': return { amount: v.amount, ...(windows.length ? { windows } : {}) };
    case 'DAILY_TARGET':
    case 'WEEKLY_TARGET': return { targets: v.targets };
    case 'WAITING_TIME': return { at: v.at, freeMinutes: v.freeMinutes, perMinute: v.perMinute, ...(v.maxAmount != null ? { maxAmount: v.maxAmount } : {}) };
    case 'OUTCOME_COMPENSATION': return { outcome: v.outcome, mode: v.mode, value: v.value };
  }
}

function RuleModal({ rule, onClose }: { rule: EarningRule | null; onClose: () => void }) {
  const [form] = Form.useForm<RuleForm>();
  const zones = useZones();
  const { message } = AntApp.useApp();
  const kind = Form.useWatch('kind', form) ?? rule?.kind ?? 'BASE_PER_DELIVERY';
  const save = useDeliveryMutation((b: Partial<EarningRule>) => (rule ? deliveryApi.updateRule(rule.id, b) : deliveryApi.createRule(b)));
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await save.mutateAsync({
        name: v.name, ...(rule ? {} : { kind: v.kind }), zoneId: v.zoneId ?? null, config: toConfig(v),
        validFrom: v.validity?.[0]?.startOf('day').toISOString() ?? null, validTo: v.validity?.[1]?.endOf('day').toISOString() ?? null,
      } as Partial<EarningRule>);
      message.success('Rule saved');
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e));
    }
  };
  const money = (name: string | Array<string | number>, label: string, required = true) => (
    <Form.Item name={name} label={label} rules={required ? [{ required: true }] : []}><InputNumber min={0} prefix="₹" style={{ width: '100%' }} /></Form.Item>
  );
  const windowsList = (optional: boolean) => (
    <Form.List name="windows">
      {(fields, { add, remove }) => (
        <>
          <Typography.Text strong>Time windows{optional ? ' (optional - empty = all day)' : ''}</Typography.Text>
          {fields.map((f) => (
            <Space key={f.key} align="baseline" wrap style={{ display: 'flex' }}>
              <Form.Item name={[f.name, 'days']} style={{ minWidth: 220 }}><Select mode="multiple" placeholder="Every day" options={DAYS.map((d, i) => ({ value: i, label: d }))} /></Form.Item>
              <Form.Item name={[f.name, 'time']} rules={[{ required: true }]}><TimePicker.RangePicker format="HH:mm" order={false} /></Form.Item>
              <MinusCircleOutlined onClick={() => remove(f.name)} />
            </Space>
          ))}
          <Button size="small" icon={<PlusOutlined />} onClick={() => add({ days: [], time: [dayjs('18:00', 'HH:mm'), dayjs('21:00', 'HH:mm')] })} style={{ marginTop: 6 }}>Add window</Button>
        </>
      )}
    </Form.List>
  );

  return (
    <Modal open title={rule ? `Edit · ${rule.name}` : 'New pay rule'} width={680} onCancel={onClose} onOk={() => void submit()} confirmLoading={save.isPending} okText="Save rule" destroyOnClose>
      <Form<RuleForm> form={form} layout="vertical" initialValues={toForm(rule)} preserve={false}>
        <Row gutter={12}>
          <Col span={14}><Form.Item name="name" label="Name" rules={[{ required: true, min: 2 }]}><Input placeholder="e.g. Standard rate card" /></Form.Item></Col>
          <Col span={10}>
            <Form.Item name="kind" label="Kind" rules={[{ required: true }]}>
              <Select disabled={Boolean(rule)} options={Object.entries(KIND).map(([k, v]) => ({ value: k, label: v.label }))} />
            </Form.Item>
          </Col>
        </Row>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={KIND[kind].help} />

        {kind === 'BASE_PER_DELIVERY' || kind === 'PEAK_HOUR' || kind === 'ZONE_INCENTIVE' ? money('amount', kind === 'BASE_PER_DELIVERY' ? 'Amount per delivery' : 'Extra per delivery') : null}

        {kind === 'DISTANCE_SLAB' ? (
          <>
            <Form.List name="slabs">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((f, i) => (
                    <Space key={f.key} align="baseline">
                      <span style={{ width: 70, display: 'inline-block' }}>{i === 0 ? '0 km' : 'from prev.'} to</span>
                      <Form.Item name={[f.name, 'uptoKm']}><InputNumber min={0.1} step={0.5} placeholder="and beyond" addonAfter="km" /></Form.Item>
                      <Form.Item name={[f.name, 'amount']} rules={[{ required: true }]}><InputNumber min={0} prefix="₹" /></Form.Item>
                      {fields.length > 1 ? <MinusCircleOutlined onClick={() => remove(f.name)} /> : null}
                    </Space>
                  ))}
                  <Button size="small" icon={<PlusOutlined />} onClick={() => add({ uptoKm: null, amount: 0 })}>Add slab</Button>
                  <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 6 }}>Leave the last slab's km empty for "and beyond". Beyond the last closed slab, the last slab's amount is paid.</Typography.Paragraph>
                </>
              )}
            </Form.List>
            {money('unknownDistanceAmount', 'When the customer has no map pin (optional)', false)}
          </>
        ) : null}

        {kind === 'PEAK_HOUR' ? windowsList(false) : null}
        {kind === 'ZONE_INCENTIVE' ? windowsList(true) : null}

        {kind === 'DAILY_TARGET' || kind === 'WEEKLY_TARGET' ? (
          <Form.List name="targets">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="baseline">
                    <Form.Item name={[f.name, 'deliveries']} rules={[{ required: true }]}><InputNumber min={1} addonAfter="deliveries" /></Form.Item>
                    <Form.Item name={[f.name, 'bonus']} rules={[{ required: true }]}><InputNumber min={0} prefix="₹" addonAfter="bonus" /></Form.Item>
                    {fields.length > 1 ? <MinusCircleOutlined onClick={() => remove(f.name)} /> : null}
                  </Space>
                ))}
                <Button size="small" icon={<PlusOutlined />} onClick={() => add({ deliveries: 20, bonus: 200 })}>Add target</Button>
              </>
            )}
          </Form.List>
        ) : null}

        {kind === 'WAITING_TIME' ? (
          <Row gutter={12}>
            <Col span={8}><Form.Item name="at" label="Where"><Select options={[{ value: 'PICKUP', label: 'At the store' }, { value: 'DROP', label: 'At the customer' }, { value: 'BOTH', label: 'Both' }]} /></Form.Item></Col>
            <Col span={5}><Form.Item name="freeMinutes" label="Free minutes" rules={[{ required: true }]}><InputNumber min={0} /></Form.Item></Col>
            <Col span={5}><Form.Item name="perMinute" label="₹ / minute" rules={[{ required: true }]}><InputNumber min={0} step={0.5} /></Form.Item></Col>
            <Col span={6}><Form.Item name="maxAmount" label="Cap (optional)"><InputNumber min={0} prefix="₹" /></Form.Item></Col>
          </Row>
        ) : null}

        {kind === 'OUTCOME_COMPENSATION' ? (
          <Row gutter={12}>
            <Col span={12}><Form.Item name="outcome" label="When" rules={[{ required: true }]}><Select options={Object.entries(OUTCOMES).map(([k, v]) => ({ value: k, label: v }))} /></Form.Item></Col>
            <Col span={7}><Form.Item name="mode" label="Pay"><Select options={[{ value: 'FIXED', label: 'Fixed amount' }, { value: 'PERCENT_OF_DELIVERY', label: '% of delivery pay' }]} /></Form.Item></Col>
            <Col span={5}><Form.Item name="value" label="Value" rules={[{ required: true }]}><InputNumber min={0} /></Form.Item></Col>
          </Row>
        ) : null}

        <Row gutter={12} style={{ marginTop: 8 }}>
          <Col span={12}>
            <Form.Item name="zoneId" label="Zone" rules={kind === 'ZONE_INCENTIVE' ? [{ required: true, message: 'A zone incentive needs a zone' }] : []} extra={kind === 'ZONE_INCENTIVE' ? undefined : 'Empty = every zone'}>
              <Select allowClear placeholder="All zones" options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} />
            </Form.Item>
          </Col>
          <Col span={12}><Form.Item name="validity" label="Valid (optional)"><DatePicker.RangePicker allowEmpty={[true, true]} style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------- failure reasons

function Reasons() {
  const reasons = useFailureReasons();
  const canManage = useCan('DELIVERY_SETTINGS_MANAGE');
  const { message } = AntApp.useApp();
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm();
  const update = useDeliveryMutation(({ id, b }: { id: string; b: Partial<FailureReason> }) => deliveryApi.updateReason(id, b));
  const create = useDeliveryMutation((b: Partial<FailureReason>) => deliveryApi.createReason(b));
  const flag = (r: FailureReason, k: keyof FailureReason) => (
    <Switch size="small" checked={Boolean(r[k])} disabled={!canManage} onChange={(v) => update.mutate({ id: r.id, b: { [k]: v } }, { onError: (e) => message.error(apiErrorMessage(e)) })} />
  );
  const columns: ColumnsType<FailureReason> = [
    { title: 'Reason (as the rider sees it)', key: 'l', render: (_, r) => <div><b>{r.label}</b><div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.code} · {r.category.replace(/_/g, ' ').toLowerCase()}</Typography.Text></div></div> },
    { title: 'Active', key: 'a', render: (_, r) => flag(r, 'isActive') },
    { title: 'Note required', key: 'n', render: (_, r) => flag(r, 'requiresNote') },
    { title: 'Photo required', key: 'p', render: (_, r) => flag(r, 'requiresPhoto') },
    { title: 'Must have arrived', key: 'ar', render: (_, r) => flag(r, 'requiresArrival') },
    {
      title: 'Then', key: 'f',
      render: (_, r) => <Select size="small" value={r.followUp} disabled={!canManage} style={{ width: 200 }} onChange={(v) => update.mutate({ id: r.id, b: { followUp: v } })}
        options={[{ value: 'RETURN_TO_STORE', label: 'Return to store, staff decide' }, { value: 'AUTO_REATTEMPT', label: 'Return, then re-attempt automatically' }]} />,
    },
  ];
  return (
    <Card size="small" style={{ borderRadius: 10 }} title="Failed-delivery reasons" extra={canManage ? <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add reason</Button> : null}>
      <Alert showIcon type="info" style={{ marginBottom: 12 }} message="A failed delivery never cancels the order. The rider brings the goods back; staff re-attempt or resolve it on the Delivery Board (or it re-attempts automatically if the reason says so)." />
      <Table<FailureReason> rowKey="id" columns={columns} dataSource={reasons.data ?? []} loading={reasons.isLoading} pagination={false} scroll={{ x: 900 }} />
      <Modal open={adding} title="New reason" onCancel={() => setAdding(false)} destroyOnClose confirmLoading={create.isPending}
        onOk={async () => { const v = await form.validateFields(); create.mutate({ ...v, code: String(v.code).toUpperCase() }, { onSuccess: () => { message.success('Reason added'); setAdding(false); }, onError: (e) => message.error(apiErrorMessage(e)) }); }}>
        <Form form={form} layout="vertical" preserve={false} initialValues={{ category: 'OTHER', requiresNote: true }}>
          <Form.Item name="label" label="Label" rules={[{ required: true, min: 3 }]}><Input placeholder="e.g. Gated society - no entry" /></Form.Item>
          <Form.Item name="code" label="Code" rules={[{ required: true, pattern: /^[A-Za-z0-9_]{3,40}$/ }]}><Input placeholder="NO_ENTRY" /></Form.Item>
          <Form.Item name="category" label="Counts as (for rider pay)"><Select options={['CUSTOMER_UNAVAILABLE', 'CUSTOMER_REFUSED', 'ADDRESS_ISSUE', 'RIDER_ISSUE', 'OTHER'].map((c) => ({ value: c, label: c.replace(/_/g, ' ').toLowerCase() }))} /></Form.Item>
          <Space size={24}>
            <Form.Item name="requiresNote" label="Note required" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="requiresPhoto" label="Photo required" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="requiresArrival" label="Must have arrived" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------- dispatch settings

function Dispatch() {
  const s = useDeliverySettings();
  const canManage = useCan('DELIVERY_SETTINGS_MANAGE');
  const [form] = Form.useForm();
  const { message } = AntApp.useApp();
  const save = useDeliveryMutation((b: Record<string, unknown>) => deliveryApi.updateSettings(b));
  useEffect(() => {
    if (s.data) form.setFieldsValue({ ...s.data, maxCashInHand: s.data.maxCashInHand === null ? null : Number(s.data.maxCashInHand) });
  }, [s.data, form]);
  return (
    <Card size="small" style={{ borderRadius: 10 }} loading={s.isLoading}>
      <Form form={form} layout="vertical" disabled={!canManage} onFinish={(v) => save.mutate(v, { onSuccess: () => message.success('Settings saved'), onError: (e) => message.error(apiErrorMessage(e)) })}>
        <Row gutter={16}>
          <Col xs={24} md={8}><Form.Item name="autoOffer" label="Offer deliveries to riders automatically" valuePropName="checked" extra="Off = staff assign every delivery."><Switch /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="offerTimeoutSeconds" label="Seconds a rider has to accept"><InputNumber min={10} max={600} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="maxOfferRounds" label="Riders to try before staff"><InputNumber min={1} max={50} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="locationFreshMinutes" label="Ignore rider locations older than (min)"><InputNumber min={1} max={120} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="geofenceMeters" label="Arrival counts within (metres)"><InputNumber min={20} max={5000} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="reattemptDelayMinutes" label="Auto re-attempt after (min)"><InputNumber min={0} max={1440} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} md={8}><Form.Item name="requireCodBeforeDelivery" label="COD must be collected before the OTP completes delivery" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col xs={12} md={8}><Form.Item name="maxCashInHand" label="Stop offers to riders holding at least (₹)" extra="Empty = no limit"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
        </Row>
        {canManage ? <Button type="primary" htmlType="submit" loading={save.isPending}>Save</Button> : <Typography.Text type="secondary">View only.</Typography.Text>}
      </Form>
    </Card>
  );
}
