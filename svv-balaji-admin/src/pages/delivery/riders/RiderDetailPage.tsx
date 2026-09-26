import {
  ArrowLeftOutlined, CarOutlined, CheckCircleOutlined, CloseCircleOutlined, EnvironmentOutlined, MailOutlined, PhoneOutlined, PlusOutlined, RiseOutlined, ShopOutlined, WalletOutlined,
} from '@ant-design/icons';
import {
  App as AntApp, Alert, Avatar, Button, Card, Col, DatePicker, Descriptions, Empty, Form, Image, Input, InputNumber, Modal, Result, Row, Select, Space, Spin, Table, Tabs, Tag, Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { EARNING_TYPE_LABEL, deliveryApi, type DeliveryTaskRow, type RiderDetail } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { useDeliveryMutation, useDeliveryTasks, useRider, useRiderCash, useRiderEarnings } from '@shared/hooks/useDelivery';
import { InfoRow, StatCard } from '../../customers/detailPageParts';
import { ApproveModal, OutletSelect, RIDER_STATUS, TASK_STATUS, VEHICLE_LABEL, cashEntryLabel, inr, useRiderActions, vehicleText } from './riderParts';

type TabKey = 'overview' | 'deliveries' | 'earnings' | 'cash';

/** One rider: profile, settings, deliveries, earnings and the cash they hold. Tabs live in the URL (?tab=). */
export function RiderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const tab = (['overview', 'deliveries', 'earnings', 'cash'].includes(params.get('tab') ?? '') ? params.get('tab') : 'overview') as TabKey;
  const rider = useRider(id);
  const week = useRiderEarnings(id ?? null);
  const navigate = useNavigate();
  const canManage = useCan('RIDERS_MANAGE');
  const actions = useRiderActions();
  const [approving, setApproving] = useState(false);

  if (rider.isLoading) return <div style={{ textAlign: 'center', padding: 64 }}><Spin /></div>;
  if (rider.isError || !rider.data) {
    return <Result status="404" title="Rider not found" extra={<Button onClick={() => navigate('/riders')}>All riders</Button>} />;
  }
  const r = rider.data;
  const st = RIDER_STATUS[r.status];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card className="page-card" styles={{ body: { padding: 20 } }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} aria-label="Back" />
          <Avatar size={64} src={r.photoUrl ?? undefined} style={{ background: '#ff8a00', fontSize: 26 }}>{r.fullName.charAt(0)}</Avatar>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Space size={8} wrap>
              <Typography.Title level={4} style={{ margin: 0 }}>{r.fullName}</Typography.Title>
              <Tag color={st.color}>{st.label}</Tag>
              {r.status === 'ACTIVE' ? <Tag color={r.availability === 'ONLINE' ? 'green' : 'default'}>{r.availability === 'ONLINE' ? 'Online' : 'Offline'}</Tag> : null}
            </Space>
            <Typography.Text type="secondary">{[r.code, r.phone, r.warehouse?.name].filter(Boolean).join(' · ')}</Typography.Text>
          </div>
          {canManage ? (
            <Space wrap>
              {r.status === 'PENDING_APPROVAL' ? <><Button type="primary" onClick={() => setApproving(true)}>Approve</Button><Button danger onClick={() => actions.reject(r)}>Reject</Button></> : null}
              {r.status === 'ACTIVE' ? <Button danger onClick={() => actions.suspend(r)}>Suspend</Button> : null}
              {r.status === 'SUSPENDED' ? <Button type="primary" onClick={() => actions.reactivate(r)}>Reactivate</Button> : null}
            </Space>
          ) : null}
        </div>
        {r.rejectionReason && (r.status === 'REJECTED' || r.status === 'SUSPENDED') ? (
          <Alert style={{ marginTop: 14 }} type={r.status === 'SUSPENDED' ? 'error' : 'warning'} showIcon message={`${st.label}: ${r.rejectionReason}`} />
        ) : null}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><StatCard icon={<CheckCircleOutlined />} tone="green" label="Delivered (all time)" value={r.stats.delivered} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<CloseCircleOutlined />} tone="red" label="Failed / returned" value={r.stats.failed} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<RiseOutlined />} tone="blue" label="Earned this week" value={inr(week.data?.thisWeek ?? 0)} /></Col>
        <Col xs={12} lg={6}><StatCard icon={<WalletOutlined />} tone="amber" label="Cash in hand" value={inr(r.cashInHand)} /></Col>
      </Row>

      <Card className="page-card" styles={{ body: { paddingTop: 4 } }}>
        <Tabs
          activeKey={tab}
          onChange={(k) => setParams(k === 'overview' ? {} : { tab: k }, { replace: true })}
          items={[
            { key: 'overview', label: 'Overview', children: <Overview r={r} /> },
            { key: 'deliveries', label: 'Deliveries', children: <Deliveries riderId={r.id} /> },
            { key: 'earnings', label: 'Earnings', children: <Earnings riderId={r.id} /> },
            { key: 'cash', label: 'Cash in hand', children: <Cash riderId={r.id} /> },
          ]}
        />
      </Card>
      <ApproveModal rider={approving ? r : null} onClose={() => setApproving(false)} />
    </Space>
  );
}

// ------------------------------------------------------------------ overview

function Overview({ r }: { r: RiderDetail }) {
  const navigate = useNavigate();
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card size="small" title="Profile" className="page-card">
          <Space direction="vertical" size={16}>
            <InfoRow icon={<PhoneOutlined />} label="Phone" value={r.phone} />
            <InfoRow icon={<MailOutlined />} label="Email" value={r.email ?? '—'} />
            <InfoRow icon={<EnvironmentOutlined />} label="City" value={r.city ?? '—'} />
            <InfoRow icon={<CarOutlined />} label="Vehicle" value={vehicleText(r.vehicleType, r.vehicleNumber)} />
            <InfoRow icon={<ShopOutlined />} label="Home outlet" value={r.warehouse?.name ?? 'Not assigned'} />
          </Space>
        </Card>
        <Card size="small" title="Review" className="page-card" style={{ marginTop: 16 }}>
          <Descriptions column={1} size="small" items={[
            { key: 'j', label: 'Signed up', children: dayjs(r.createdAt).format('D MMM YYYY, h:mm A') },
            { key: 'r', label: 'Reviewed', children: r.reviewedAt ? `${dayjs(r.reviewedAt).format('D MMM YYYY')}${r.reviewedBy ? ` by ${r.reviewedBy.fullName}` : ''}` : '—' },
            { key: 'l', label: 'Last location', children: r.lastLocationAt ? dayjs(r.lastLocationAt).format('D MMM, h:mm A') : '—' },
            { key: 'n', label: 'Licence no.', children: r.licenceNumber ?? '—' },
          ]} />
          <div style={{ marginTop: 8 }}>
            <Typography.Text type="secondary">Licence / ID</Typography.Text>
            <div style={{ marginTop: 6 }}>{r.documentUrl ? <Image src={r.documentUrl} width={220} style={{ borderRadius: 8 }} /> : <Typography.Text type="warning">Not uploaded</Typography.Text>}</div>
          </div>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Settings r={r} />
        <Card size="small" title="Carrying now" className="page-card" style={{ marginTop: 16 }}>
          {r.activeTasks.length ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              {r.activeTasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <a onClick={() => navigate(`/delivery-board?task=${t.id}`)}>{t.taskNumber}</a>
                  <Tag color={TASK_STATUS[t.status].color}>{TASK_STATUS[t.status].label}</Tag>
                </div>
              ))}
            </Space>
          ) : <Typography.Text type="secondary">No delivery in hand.</Typography.Text>}
        </Card>
      </Col>
    </Row>
  );
}

function Settings({ r }: { r: RiderDetail }) {
  const canManage = useCan('RIDERS_MANAGE');
  const [form] = Form.useForm();
  const { message } = AntApp.useApp();
  const save = useDeliveryMutation((v: { warehouseId?: string; maxActiveTasks?: number; vehicleType?: string; vehicleNumber?: string; city?: string }) => deliveryApi.updateRider(r.id, v));
  const editable = canManage && (r.status === 'ACTIVE' || r.status === 'SUSPENDED');
  return (
    <Card size="small" title="Dispatch settings" className="page-card"
      extra={editable ? <Button type="primary" size="small" loading={save.isPending} onClick={() => form.submit()}>Save</Button> : null}>
      <Form form={form} layout="vertical" disabled={!editable} key={r.id}
        initialValues={{ warehouseId: r.warehouse?.id, maxActiveTasks: r.maxActiveTasks, vehicleType: r.vehicleType ?? undefined, vehicleNumber: r.vehicleNumber ?? '', city: r.city ?? '' }}
        onFinish={(v) => save.mutate(v, { onSuccess: () => message.success('Saved'), onError: (e) => message.error(apiErrorMessage(e)) })}>
        <Row gutter={12}>
          <Col span={16}>
            <Form.Item name="warehouseId" label="Home outlet" extra="Deliveries picked up here are offered to this rider.">
              <OutletSelect homeOutlet />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="maxActiveTasks" label="Deliveries at once"><InputNumber min={1} max={5} style={{ width: '100%' }} /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="vehicleType" label="Vehicle"><Select options={Object.entries(VEHICLE_LABEL).map(([value, label]) => ({ value, label }))} /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="vehicleNumber" label="Vehicle no."><Input maxLength={20} /></Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="city" label="City"><Input maxLength={60} /></Form.Item>
          </Col>
        </Row>
      </Form>
      {!editable && canManage ? <Typography.Text type="secondary">Settings open once the rider is approved.</Typography.Text> : null}
    </Card>
  );
}

// ------------------------------------------------------------------ deliveries

function Deliveries({ riderId }: { riderId: string }) {
  const tasks = useDeliveryTasks({ riderId });
  const navigate = useNavigate();
  return (
    <Table<DeliveryTaskRow>
      rowKey="id" size="middle" loading={tasks.isLoading} dataSource={tasks.data ?? []} scroll={{ x: 900 }} pagination={{ pageSize: 15, hideOnSinglePage: true }}
      locale={{ emptyText: <Empty description="No deliveries yet" /> }}
      onRow={(t) => ({ onClick: () => navigate(`/delivery-board?task=${t.id}`), style: { cursor: 'pointer' } })}
      columns={[
        { title: 'Task', key: 't', render: (_, t) => <div><b>{t.taskNumber}</b><div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.order?.orderNumber ?? '—'}{t.speed === 'QUICK' ? ' · Quick' : ''}{t.attempt > 1 ? ` · attempt ${t.attempt}` : ''}</Typography.Text></div></div> },
        { title: 'Status', key: 's', render: (_, t) => <Tag color={TASK_STATUS[t.status].color}>{TASK_STATUS[t.status].label}</Tag> },
        { title: 'Customer', key: 'c', render: (_, t) => <div>{t.dropName}<div><Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: t.dropAddress }}>{t.dropAddress}</Typography.Text></div></div>, width: 260 },
        { title: 'Distance', key: 'd', render: (_, t) => (t.distanceKm ? `${Number(t.distanceKm).toFixed(1)} km` : '—') },
        { title: 'COD', key: 'cod', align: 'right', render: (_, t) => (Number(t.codAmount) ? inr(t.codAmount) : '—') },
        { title: 'When', key: 'w', render: (_, t) => dayjs(t.deliveredAt ?? t.assignedAt ?? t.readyAt).format('D MMM, h:mm A') },
      ]}
    />
  );
}

// ------------------------------------------------------------------ earnings

function Earnings({ riderId }: { riderId: string }) {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const q = range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : {};
  const e = useRiderEarnings(riderId, q);
  const canAdjust = useCan('DELIVERY_SETTINGS_MANAGE');
  const [adjusting, setAdjusting] = useState(false);
  const data = e.data;
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space wrap>
          <DatePicker.RangePicker value={range} onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} allowClear placeholder={['This week', 'today']}
            presets={[
              { label: 'Today', value: [dayjs(), dayjs()] },
              { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
              { label: 'Last month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            ]} />
          <Tag>Today {inr(data?.today ?? 0)}</Tag>
          <Tag color="orange">This week {inr(data?.thisWeek ?? 0)}</Tag>
        </Space>
        {canAdjust ? <Button icon={<PlusOutlined />} onClick={() => setAdjusting(true)}>Adjustment</Button> : null}
      </Space>
      <Card size="small" className="page-card" loading={e.isLoading}>
        <Space size={32} wrap>
          <div><div className="page-field-label">Earned in period</div><div className="page-stat-value">{inr(data?.range.total ?? 0)}</div></div>
          <div><div className="page-field-label">Deliveries</div><div className="page-stat-value">{data?.range.deliveries ?? 0}</div></div>
          {Object.entries(data?.byType ?? {}).map(([k, v]) => (
            <div key={k}><div className="page-field-label">{EARNING_TYPE_LABEL[k] ?? k}</div><Typography.Text strong>{inr(v)}</Typography.Text></div>
          ))}
        </Space>
      </Card>
      <Table size="small" rowKey="id" loading={e.isLoading} dataSource={data?.lines ?? []} pagination={{ pageSize: 15, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="Nothing earned in this period" /> }}
        columns={[
          { title: 'When', dataIndex: 'earnedAt', render: (d: string) => dayjs(d).format('D MMM, h:mm A') },
          { title: 'Type', dataIndex: 'type', render: (t: string) => <Tag color={t === 'ADJUSTMENT' ? 'purple' : undefined}>{EARNING_TYPE_LABEL[t] ?? t}</Tag> },
          { title: 'Delivery', key: 'o', render: (_, l) => (l.taskNumber ? `${l.taskNumber}${l.orderNumber ? ` · ${l.orderNumber}` : ''}` : '—') },
          { title: 'Note', dataIndex: 'note', render: (v) => v ?? '—' },
          { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v: number) => <Typography.Text strong type={v < 0 ? 'danger' : undefined}>{inr(v)}</Typography.Text> },
        ]} />
      <AdjustmentModal riderId={adjusting ? riderId : null} onClose={() => setAdjusting(false)} />
    </Space>
  );
}

/** A manual pay line: + to pay more, - to claw back. Needs a note; shows in the rider's earnings. */
export function AdjustmentModal({ riderId, riderName, onClose }: { riderId: string | null; riderName?: string; onClose: () => void }) {
  const [form] = Form.useForm<{ direction: 'add' | 'deduct'; amount: number; note: string }>();
  const { message } = AntApp.useApp();
  const m = useDeliveryMutation((v: { amount: number; note: string }) => deliveryApi.adjustEarnings(riderId!, v));
  return (
    <Modal open={Boolean(riderId)} title={`Pay adjustment${riderName ? ` · ${riderName}` : ''}`} okText="Record" confirmLoading={m.isPending} destroyOnHidden onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          await m.mutateAsync({ amount: v.direction === 'deduct' ? -v.amount : v.amount, note: v.note.trim() });
          message.success('Adjustment recorded');
          onClose();
        } catch (e) {
          message.error(apiErrorMessage(e));
        }
      }}>
      <Form form={form} layout="vertical" initialValues={{ direction: 'add' }} preserve={false}>
        <Form.Item name="direction" label="Type">
          <Select options={[{ value: 'add', label: 'Pay extra (bonus, correction)' }, { value: 'deduct', label: 'Deduct (penalty, overpayment)' }]} />
        </Form.Item>
        <Form.Item name="amount" label="Amount" rules={[{ required: true, message: 'Enter an amount' }]}>
          <InputNumber prefix="₹" min={0.01} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="note" label="Reason" rules={[{ required: true, min: 3, message: 'Say why (the rider sees this)' }]}>
          <Input.TextArea rows={2} maxLength={300} placeholder="Shown to the rider on their earnings" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ------------------------------------------------------------------ cash

function Cash({ riderId }: { riderId: string }) {
  const cash = useRiderCash(riderId);
  const canCash = useCan('RIDER_CASH_RECORD');
  const [depositing, setDepositing] = useState(false);
  const balance = cash.data?.balance ?? 0;
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" className="page-card">
        <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
          <div><div className="page-field-label">Holding now</div><div className="page-stat-value">{inr(balance)}</div></div>
          {canCash ? <Button type="primary" disabled={balance <= 0} onClick={() => setDepositing(true)}>Record deposit</Button> : null}
        </Space>
      </Card>
      <Table size="small" rowKey="id" loading={cash.isLoading} dataSource={cash.data?.entries ?? []} pagination={{ pageSize: 15, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="No cash collected yet" /> }}
        columns={[
          { title: 'When', dataIndex: 'createdAt', render: (d: string) => dayjs(d).format('D MMM, h:mm A') },
          { title: 'What', dataIndex: 'type', render: (t: string) => <Tag color={t === 'DEPOSITED' ? 'green' : 'orange'}>{cashEntryLabel(t)}</Tag> },
          { title: 'Reference', dataIndex: 'reference', render: (v) => v ?? '—' },
          { title: 'Recorded by', key: 'b', render: (_, e) => e.recordedBy?.fullName ?? (e.type === 'COD_COLLECTED' ? 'Rider app' : '—') },
          { title: 'Amount', dataIndex: 'amount', align: 'right', render: (v: number) => <Typography.Text strong type={v < 0 ? 'success' : undefined}>{inr(v)}</Typography.Text> },
        ]} />
      <DepositModal rider={depositing ? { id: riderId, balance } : null} onClose={() => setDepositing(false)} />
    </Space>
  );
}

/** Cash the rider handed over at the outlet. Cannot exceed what they hold (the API refuses it too). */
export function DepositModal({ rider, onClose }: { rider: { id: string; balance: number; fullName?: string } | null; onClose: () => void }) {
  const [form] = Form.useForm<{ amount: number; reference?: string; note?: string }>();
  const { message } = AntApp.useApp();
  const m = useDeliveryMutation((v: { amount: number; reference?: string; note?: string }) => deliveryApi.deposit(rider!.id, v));
  return (
    <Modal open={Boolean(rider)} title={`Record deposit${rider?.fullName ? ` · ${rider.fullName}` : ''}`} okText="Record" confirmLoading={m.isPending} destroyOnHidden onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          await m.mutateAsync({ amount: v.amount, reference: v.reference?.trim() || undefined, note: v.note?.trim() || undefined });
          message.success('Deposit recorded');
          onClose();
        } catch (e) {
          message.error(apiErrorMessage(e));
        }
      }}>
      <Typography.Paragraph type="secondary">Holding {inr(rider?.balance ?? 0)}.</Typography.Paragraph>
      <Form form={form} layout="vertical" initialValues={{ amount: rider?.balance }} preserve={false}>
        <Form.Item name="amount" label="Amount handed over" rules={[{ required: true }]}>
          <InputNumber prefix="₹" min={0.01} max={rider?.balance} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="reference" label="Reference" extra="Receipt or bank slip number, if any"><Input maxLength={80} /></Form.Item>
        <Form.Item name="note" label="Note"><Input.TextArea rows={2} maxLength={300} /></Form.Item>
      </Form>
    </Modal>
  );
}
