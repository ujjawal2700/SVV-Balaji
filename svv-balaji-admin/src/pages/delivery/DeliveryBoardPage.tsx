import { ReloadOutlined, ThunderboltOutlined, UserAddOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Card, Col, Descriptions, Drawer, Image, Input, Modal, Popover, Row, Select, Space, Statistic, Switch, Table, Tag, Timeline, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { deliveryApi, VEHICLE_LABEL, type DeliveryTaskRow, type RiderState, type TaskCandidates, type TaskStatus } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useDeliveryMutation, useDeliveryTask, useDeliveryTasks, useRiderAvailability, useTaskCandidates } from '@shared/hooks/useDelivery';

const STATUS: Record<TaskStatus, { label: string; color: string }> = {
  READY_FOR_PICKUP: { label: 'Ready for pickup', color: 'gold' }, OFFERED: { label: 'Offered', color: 'orange' }, ASSIGNED: { label: 'Rider assigned', color: 'blue' },
  AT_PICKUP: { label: 'Rider at store', color: 'blue' }, PICKED_UP: { label: 'Picked up', color: 'geekblue' }, OUT_FOR_DELIVERY: { label: 'Out for delivery', color: 'purple' },
  AT_DROP: { label: 'At customer', color: 'purple' }, DELIVERED: { label: 'Delivered', color: 'green' }, FAILED: { label: 'Failed - returning', color: 'red' },
  RETURNED_TO_STORE: { label: 'Back at store', color: 'volcano' }, CANCELLED: { label: 'Cancelled', color: 'default' },
};
const OFFER_RESULT: Record<string, string> = {
  PENDING: 'Waiting', ACCEPTED: 'Accepted', REJECTED: 'Rejected', EXPIRED: 'No answer', WITHDRAWN: 'Withdrawn', TAKEN: 'Another rider was faster',
};
const RIDER_STATE: Record<RiderState, { label: string; color: string }> = {
  AVAILABLE: { label: 'Available', color: 'green' }, BUSY: { label: 'Busy', color: 'orange' },
  NOT_RESPONDING: { label: 'Not responding', color: 'gold' }, OFFLINE: { label: 'Offline', color: 'default' },
};
const waitingForRider = (t: Pick<DeliveryTaskRow, 'status' | 'rider'>) => ['READY_FOR_PICKUP', 'OFFERED'].includes(t.status) && !t.rider;
/** Return pickups / exchange deliveries have no order of their own - name them by their request. */
export const taskRef = (t: Pick<DeliveryTaskRow, 'kind' | 'order' | 'returnRequest'>) =>
  t.returnRequest ? `${t.kind === 'REPLACEMENT_DELIVERY' ? 'Exchange delivery' : 'Return pickup'} · ${t.returnRequest.requestNumber}` : t.order?.orderNumber ?? '';
const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Every local / Quick delivery: who has it, where it is, and the ones waiting on staff. */
export function DeliveryBoardPage() {
  const [status, setStatus] = useState<TaskStatus | undefined>();
  const [needs, setNeeds] = useState(false);
  const tasks = useDeliveryTasks({ status, needsAssignment: needs });
  // ?task=<id> opens that delivery straight away (linked from a rider's page).
  const [params, setParams] = useSearchParams();
  const [open, setOpenState] = useState<string | null>(() => params.get('task'));
  const setOpen = (id: string | null) => {
    setOpenState(id);
    if (!id && params.has('task')) setParams({}, { replace: true });
  };
  const waiting = (tasks.data ?? []).filter((t) => t.needsManualAssignment && ['READY_FOR_PICKUP', 'OFFERED'].includes(t.status)).length;

  const columns: ColumnsType<DeliveryTaskRow> = [
    {
      title: 'Task',
      key: 't',
      render: (_, t) => (
        <div>
          <a onClick={() => setOpen(t.id)} style={{ fontWeight: 600 }}>{t.taskNumber}</a> {t.speed === 'QUICK' ? <Tag color="orange" icon={<ThunderboltOutlined />}>Quick</Tag> : null}{t.attempt > 1 ? <Tag>Attempt {t.attempt}</Tag> : null}
          <div>{t.returnRequest ? <Tag color="volcano" style={{ marginRight: 4 }}>{t.kind === 'REPLACEMENT_DELIVERY' ? 'Exchange' : 'Return pickup'}</Tag> : null}<Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.returnRequest?.requestNumber ?? t.order?.orderNumber} · {t.warehouse.name}</Typography.Text></div>
        </div>
      ),
    },
    {
      title: 'Status', key: 's', render: (_, t) => (
        <Space size={4} wrap>
          <Tag color={STATUS[t.status].color}>{STATUS[t.status].label}{t.status === 'OFFERED' ? ` · round ${t.offerRound}` : ''}</Tag>
          {waitingForRider(t) && t.autoDispatchPaused ? <Tag color="purple">Manual</Tag> : t.needsManualAssignment && waitingForRider(t) ? <Tag color="red">Needs a rider</Tag> : null}
        </Space>
      ),
    },
    { title: 'Rider', key: 'r', render: (_, t) => (t.rider ? <span>{t.rider.fullName}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.rider.phone}</Typography.Text></span> : <Typography.Text type="secondary">—</Typography.Text>) },
    { title: 'Customer', key: 'c', render: (_, t) => <span>{t.dropName}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.distanceKm ? `${Number(t.distanceKm).toFixed(1)} km` : 'no pin'}</Typography.Text></span> },
    { title: 'COD', key: 'cod', align: 'right', render: (_, t) => (Number(t.codAmount) ? inr(t.codAmount) : <Tag>Prepaid</Tag>) },
    { title: 'Promised by', key: 'p', render: (_, t) => (t.promisedBy ? <span style={{ color: !['DELIVERED', 'CANCELLED'].includes(t.status) && dayjs(t.promisedBy).isBefore(dayjs()) ? '#dc2626' : undefined }}>{dayjs(t.promisedBy).format('h:mm A')}</span> : '—') },
    { title: 'Ready', dataIndex: 'readyAt', render: (d: string) => dayjs(d).format('D MMM, h:mm A') },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Delivery Board" subtitle="Packed local and Quick orders are offered to the nearest available riders at once - the first to accept gets it. Staff can take any delivery over and assign it by hand." />
      {waiting ? <Alert type="warning" showIcon message={`${waiting} deliver${waiting === 1 ? 'y needs' : 'ies need'} a rider`} action={<Button size="small" onClick={() => setNeeds(true)}>Show</Button>} /> : null}
      <AvailabilityCard />
      <Card size="small" style={{ borderRadius: 10 }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select allowClear placeholder="All statuses" style={{ width: 200 }} value={status} onChange={setStatus} options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
          <Space><Switch size="small" checked={needs} onChange={setNeeds} /><span>Needs a rider</span></Space>
          <Button icon={<ReloadOutlined />} onClick={() => void tasks.refetch()} loading={tasks.isFetching}>Refresh</Button>
        </Space>
        <Table<DeliveryTaskRow> rowKey="id" columns={columns} dataSource={tasks.data ?? []} loading={tasks.isLoading} scroll={{ x: 1000 }} pagination={{ pageSize: 25 }}
          rowClassName={(t) => (t.needsManualAssignment && ['READY_FOR_PICKUP', 'OFFERED'].includes(t.status) ? 'row-attention' : '')}
          locale={{ emptyText: 'No deliveries. Packed local / Quick orders appear here automatically.' }} />
      </Card>
      <TaskDrawer id={open} onClose={() => setOpen(null)} />
    </Space>
  );
}

type Action = 'unassign' | 'redispatch' | 'reattempt' | 'pause' | 'resume';

function TaskDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useDeliveryTask(id);
  const t = q.data;
  const canManage = useCan('DELIVERY_TASKS_MANAGE');
  const { message, modal } = AntApp.useApp();
  const [assigning, setAssigning] = useState(false);
  const [assignTo, setAssignTo] = useState<string>();
  const act = useDeliveryMutation(({ kind, reason }: { kind: Action; reason?: string }) =>
    kind === 'unassign' ? deliveryApi.unassign(id!, reason!)
      : kind === 'redispatch' || kind === 'resume' ? deliveryApi.redispatch(id!)
        : kind === 'pause' ? deliveryApi.setAutoDispatch(id!, true)
          : deliveryApi.reattempt(id!));
  const run = (kind: Action, ok: string, reason?: string) =>
    act.mutate({ kind, reason }, { onSuccess: () => message.success(ok), onError: (e) => message.error(apiErrorMessage(e)) });

  if (!id) return null;
  return (
    <Drawer open width={Math.min(640, window.innerWidth)} onClose={onClose} title={t ? `${t.taskNumber} · ${taskRef(t)}` : 'Delivery'} loading={q.isLoading}>
      {t ? (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Space wrap>
            <Tag color={STATUS[t.status].color}>{STATUS[t.status].label}</Tag>
            {t.speed === 'QUICK' ? <Tag color="orange">Quick</Tag> : null}
            {t.zone ? <Tag>{t.zone.name}</Tag> : null}
          </Space>
          {canManage ? (
            <Space wrap>
              {['READY_FOR_PICKUP', 'OFFERED', 'ASSIGNED'].includes(t.status) ? <Button type="primary" icon={<UserAddOutlined />} onClick={() => { setAssignTo(undefined); setAssigning(true); }}>{t.rider ? 'Reassign rider' : 'Assign rider'}</Button> : null}
              {waitingForRider(t) ? (
                <Tooltip title={t.autoDispatchPaused ? 'Staff assign this delivery. Switch on to offer it to riders again.' : 'Offered to the nearest riders automatically. Switch off to take it over and assign by hand.'}>
                  <Space>
                    <Switch checked={!t.autoDispatchPaused} loading={act.isPending} onChange={(on) => run(on ? 'resume' : 'pause', on ? 'Offering to riders again' : 'Auto-offer paused - assign a rider by hand')} />
                    <span>Auto-offer</span>
                  </Space>
                </Tooltip>
              ) : null}
              {waitingForRider(t) && !t.autoDispatchPaused && t.needsManualAssignment ? <Button onClick={() => run('redispatch', 'Offering to riders again')}>Offer to riders again</Button> : null}
              {['ASSIGNED', 'AT_PICKUP'].includes(t.status) ? (
                <Button danger onClick={() => { let reason = ''; modal.confirm({ title: 'Take the task back from the rider?', content: <Input placeholder="Reason" onChange={(e) => (reason = e.target.value)} />, onOk: () => run('unassign', 'Taken back - offering again', reason || 'Taken back by staff') }); }}>Take back</Button>
              ) : null}
              {t.status === 'RETURNED_TO_STORE' ? <Button type="primary" onClick={() => run('reattempt', 'New attempt created')}>Re-attempt delivery</Button> : null}
            </Space>
          ) : null}
          {waitingForRider(t) ? <CandidatesCard taskId={t.id} canManage={canManage} onAssign={(riderId) => { setAssignTo(riderId); setAssigning(true); }} /> : null}
          {t.status === 'RETURNED_TO_STORE' ? <Alert type="info" showIcon message="The goods are back at the store. The order is still open (not cancelled) - re-attempt, or resolve it with the customer." /> : null}
          <Descriptions bordered size="small" column={1} items={[
            { key: 'c', label: 'Customer', children: `${t.dropName} · ${t.dropAddress}` },
            { key: 'r', label: 'Rider', children: t.rider ? `${t.rider.fullName} (${t.rider.phone})` : '—' },
            { key: 'w', label: 'Weight', children: t.weightKg !== null ? `${Number(t.weightKg).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg` : 'Not known (some products have no pack weight) - no vehicle limit applied' },
            { key: 'p', label: 'Payment', children: Number(t.codAmount) ? `COD ${inr(t.codAmount)}${t.cod ? ` - collected ${t.cod.method} ${dayjs(t.cod.collectedAt).format('h:mm A')}` : ' - not collected'}` : 'Prepaid' },
            { key: 'f', label: 'Failure', children: t.failureReasonCode ? `${t.failureReasonCode}${t.failureNote ? ` - ${t.failureNote}` : ''}` : '—' },
            { key: 'e', label: 'Rider pay', children: t.earnings.length ? t.earnings.map((e) => `${e.type} ${inr(e.amount)}`).join(', ') : '—' },
          ]} />
          {t.failureProofUrl ? <Image src={t.failureProofUrl} width={160} /> : null}
          <Card size="small" title="Timeline">
            <Timeline items={t.events.map((e) => ({ children: <span><b>{e.type.replace(/_/g, ' ').toLowerCase()}</b>{e.note ? ` - ${e.note}` : ''}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(e.createdAt).format('D MMM, h:mm:ss A')}</Typography.Text></span> }))} />
          </Card>
          {t.offers.length ? (
            <Card size="small" title="Offers">
              <Table size="small" rowKey="id" pagination={false} dataSource={t.offers} columns={[
                { title: 'Round', dataIndex: 'round' },
                { title: 'Rider', key: 'r', render: (_, o) => o.rider.fullName },
                { title: 'Result', dataIndex: 'status', render: (v: string) => <Tag color={v === 'ACCEPTED' ? 'green' : v === 'PENDING' ? 'orange' : undefined}>{OFFER_RESULT[v] ?? v}</Tag> },
                { title: 'Why', dataIndex: 'rejectReason', render: (v) => v ?? '—' },
              ]} />
            </Card>
          ) : null}
        </Space>
      ) : null}
      <AssignModal open={assigning} task={t ?? null} initialRiderId={assignTo} onClose={() => setAssigning(false)} />
    </Drawer>
  );
}

/** Rider headcount per outlet, refreshed every 10 s. */
function AvailabilityCard() {
  const q = useRiderAvailability();
  const a = q.data;
  return (
    <Card size="small" style={{ borderRadius: 10 }} title="Riders right now"
      extra={a ? (a.autoOffer ? <Tag color="blue">Auto-offer on · {a.broadcastSize} rider{a.broadcastSize === 1 ? '' : 's'} at a time</Tag> : <Tag color="red">Auto-offer off - staff assign every delivery</Tag>) : null}>
      <Row gutter={[16, 12]}>
        <Col xs={12} md={6}><Statistic title="Available" value={a?.totals.available ?? 0} valueStyle={{ color: '#16a34a' }} loading={q.isLoading} /></Col>
        <Col xs={12} md={6}><Statistic title="Busy (at order limit)" value={a?.totals.busy ?? 0} valueStyle={{ color: '#ea580c' }} loading={q.isLoading} /></Col>
        <Col xs={12} md={6}><Statistic title="Not responding" value={a?.totals.notResponding ?? 0} valueStyle={{ color: '#ca8a04' }} loading={q.isLoading} /></Col>
        <Col xs={12} md={6}><Statistic title="Offline" value={a?.totals.offline ?? 0} loading={q.isLoading} /></Col>
      </Row>
      {a && a.outlets.length ? (
        <Table size="small" rowKey="warehouseId" pagination={false} style={{ marginTop: 12 }} scroll={{ x: 640 }} dataSource={a.outlets} columns={[
          { title: 'Outlet', dataIndex: 'name' },
          { title: 'Available', dataIndex: 'available', render: (v: number) => <b style={{ color: v ? '#16a34a' : '#dc2626' }}>{v}</b> },
          { title: 'Busy', dataIndex: 'busy' },
          { title: 'Not responding', dataIndex: 'notResponding' },
          { title: 'Offline', dataIndex: 'offline' },
          {
            title: 'Riders online', key: 'r', render: (_, o) => (
              <Space size={[4, 4]} wrap>
                {o.riders.filter((r) => r.state !== 'OFFLINE').map((r) => (
                  <Popover key={r.id} content={r.reasons.length ? r.reasons.join(', ') : 'Will be offered new deliveries'}>
                    <Tag color={RIDER_STATE[r.state].color}>{r.fullName} · {r.heldTasks}/{r.maxActiveTasks}</Tag>
                  </Popover>
                ))}
                {o.riders.every((r) => r.state === 'OFFLINE') ? <Typography.Text type="secondary">Nobody online</Typography.Text> : null}
              </Space>
            ),
          },
        ]} />
      ) : !q.isLoading ? <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0' }}>No approved riders yet.</Typography.Paragraph> : null}
    </Card>
  );
}

type Candidate = TaskCandidates['riders'][number];

/** Who the dispatcher would offer this delivery to, in order, and why anyone is skipped. */
function CandidatesCard({ taskId, canManage, onAssign }: { taskId: string; canManage: boolean; onAssign: (riderId: string) => void }) {
  const q = useTaskCandidates(taskId);
  const c = q.data;
  const eligible = c?.riders.filter((r) => r.eligible).length ?? 0;
  return (
    <Card size="small" loading={q.isLoading}
      title={c ? `Riders for this delivery - ${eligible} can be offered${c.autoOffer && !c.autoDispatchPaused ? `, ${c.broadcastSize} at a time` : ''}` : 'Riders for this delivery'}
      extra={c && c.weightKg !== null ? <Tag>{c.weightKg.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg</Tag> : null}>
      {c && !c.riders.length ? <Typography.Text type="secondary">This outlet has no active riders.</Typography.Text> : null}
      {c && c.riders.length ? (
        <Table<Candidate> size="small" rowKey="id" pagination={false} dataSource={c.riders} scroll={{ x: 560 }} columns={[
          { title: '#', dataIndex: 'rank', width: 44, render: (v: number | null) => v ?? '—' },
          { title: 'Rider', key: 'n', render: (_, r) => <span>{r.fullName}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.vehicleType ? VEHICLE_LABEL[r.vehicleType] : 'No vehicle on file'}</Typography.Text></span> },
          { title: 'From pickup', dataIndex: 'km', render: (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} km`) },
          { title: 'In hand', key: 'h', render: (_, r) => `${r.heldTasks}/${r.maxActiveTasks}` },
          { title: 'Status', key: 's', render: (_, r) => (r.eligible ? <Tag color="green">Can be offered</Tag> : <Space size={[2, 2]} wrap>{r.reasons.map((x) => <Tag key={x.code}>{x.label}</Tag>)}</Space>) },
          ...(canManage ? [{ title: '', key: 'a', render: (_: unknown, r: Candidate) => <Button size="small" onClick={() => onAssign(r.id)}>Assign</Button> }] : []),
        ]} />
      ) : null}
    </Card>
  );
}

/** Manual assignment - the staff override. Any active rider of the outlet; one the dispatcher would skip gets a warning, not a block. */
export function AssignModal({ open, task, initialRiderId, onClose, onAssigned }: { open: boolean; task: Pick<DeliveryTaskRow, 'id' | 'warehouse'> | null; initialRiderId?: string; onClose: () => void; onAssigned?: () => void }) {
  const q = useTaskCandidates(open && task ? task.id : null);
  const [riderId, setRiderId] = useState<string>();
  const chosen = riderId ?? initialRiderId;
  const pick = q.data?.riders.find((r) => r.id === chosen);
  const { message } = AntApp.useApp();
  const m = useDeliveryMutation(() => deliveryApi.assign(task!.id, chosen!));
  const close = () => {
    setRiderId(undefined);
    onClose();
  };
  return (
    <Modal open={open} title="Assign a rider" okText="Assign" okButtonProps={{ disabled: !chosen }} confirmLoading={m.isPending} onCancel={close} destroyOnClose
      onOk={() => m.mutate(undefined, { onSuccess: () => { message.success('Assigned - the rider has been notified'); onAssigned?.(); close(); }, onError: (e) => message.error(apiErrorMessage(e)) })}>
      <Typography.Paragraph type="secondary">Active riders of {task?.warehouse.name}, best first. Requests already showing to riders are withdrawn.</Typography.Paragraph>
      <Select style={{ width: '100%' }} placeholder="Choose a rider" value={chosen} onChange={setRiderId} loading={q.isLoading} showSearch optionFilterProp="label"
        options={(q.data?.riders ?? []).map((r) => ({
          value: r.id,
          label: `${r.rank ? `#${r.rank} ` : ''}${r.fullName}${r.km !== null ? ` · ${r.km.toFixed(1)} km` : ''} · ${r.heldTasks}/${r.maxActiveTasks} in hand${r.eligible ? '' : ` · ${r.reasons.map((x) => x.label.toLowerCase()).join(', ')}`}`,
        }))} />
      {pick && !pick.eligible ? <Alert style={{ marginTop: 12 }} type="warning" showIcon message="The dispatcher would skip this rider" description={`${pick.reasons.map((x) => x.label).join(', ')}. You can still assign them.`} /> : null}
    </Modal>
  );
}
