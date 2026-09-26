import { ReloadOutlined, ThunderboltOutlined, UserAddOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Card, Descriptions, Drawer, Image, Input, Modal, Select, Space, Switch, Table, Tag, Timeline, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { deliveryApi, type DeliveryTaskRow, type TaskStatus } from '@shared/api/delivery';
import { useCan } from '@shared/auth/useCan';
import { PageHeader } from '@shared/components/PageHeader';
import { useDeliveryMutation, useDeliveryTask, useDeliveryTasks, useLiveRiders, useRiders } from '@shared/hooks/useDelivery';

const STATUS: Record<TaskStatus, { label: string; color: string }> = {
  READY_FOR_PICKUP: { label: 'Ready for pickup', color: 'gold' }, OFFERED: { label: 'Offered', color: 'orange' }, ASSIGNED: { label: 'Rider assigned', color: 'blue' },
  AT_PICKUP: { label: 'Rider at store', color: 'blue' }, PICKED_UP: { label: 'Picked up', color: 'geekblue' }, OUT_FOR_DELIVERY: { label: 'Out for delivery', color: 'purple' },
  AT_DROP: { label: 'At customer', color: 'purple' }, DELIVERED: { label: 'Delivered', color: 'green' }, FAILED: { label: 'Failed - returning', color: 'red' },
  RETURNED_TO_STORE: { label: 'Back at store', color: 'volcano' }, CANCELLED: { label: 'Cancelled', color: 'default' },
};
const inr = (v: string | number) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Every local / Quick delivery: who has it, where it is, and the ones waiting on staff. */
export function DeliveryBoardPage() {
  const [status, setStatus] = useState<TaskStatus | undefined>();
  const [needs, setNeeds] = useState(false);
  const tasks = useDeliveryTasks({ status, needsAssignment: needs });
  const live = useLiveRiders();
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
          <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.order?.orderNumber} · {t.warehouse.name}</Typography.Text></div>
        </div>
      ),
    },
    { title: 'Status', key: 's', render: (_, t) => <Space size={4} wrap><Tag color={STATUS[t.status].color}>{STATUS[t.status].label}</Tag>{t.needsManualAssignment && ['READY_FOR_PICKUP', 'OFFERED'].includes(t.status) ? <Tag color="red">Needs a rider</Tag> : null}</Space> },
    { title: 'Rider', key: 'r', render: (_, t) => (t.rider ? <span>{t.rider.fullName}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.rider.phone}</Typography.Text></span> : <Typography.Text type="secondary">—</Typography.Text>) },
    { title: 'Customer', key: 'c', render: (_, t) => <span>{t.dropName}<br /><Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.distanceKm ? `${Number(t.distanceKm).toFixed(1)} km` : 'no pin'}</Typography.Text></span> },
    { title: 'COD', key: 'cod', align: 'right', render: (_, t) => (Number(t.codAmount) ? inr(t.codAmount) : <Tag>Prepaid</Tag>) },
    { title: 'Promised by', key: 'p', render: (_, t) => (t.promisedBy ? <span style={{ color: !['DELIVERED', 'CANCELLED'].includes(t.status) && dayjs(t.promisedBy).isBefore(dayjs()) ? '#dc2626' : undefined }}>{dayjs(t.promisedBy).format('h:mm A')}</span> : '—') },
    { title: 'Ready', dataIndex: 'readyAt', render: (d: string) => dayjs(d).format('D MMM, h:mm A') },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <PageHeader title="Delivery Board" subtitle="Packed local and Quick orders are offered to riders automatically. Tasks nobody accepted, failed deliveries and re-attempts are handled here." />
      {waiting ? <Alert type="warning" showIcon message={`${waiting} deliver${waiting === 1 ? 'y needs' : 'ies need'} a rider`} action={<Button size="small" onClick={() => setNeeds(true)}>Show</Button>} /> : null}
      <Card size="small" style={{ borderRadius: 10 }} title={`Online riders (${live.data?.length ?? 0})`}>
        <Space wrap>
          {(live.data ?? []).length === 0 ? <Typography.Text type="secondary">Nobody is online.</Typography.Text> : (live.data ?? []).map((r) => (
            <Tag key={r.id} color={r.tasks.length ? 'orange' : 'green'} style={{ padding: '4px 10px' }}>
              {r.fullName} · {r.warehouse?.name} {r.tasks.length ? `· ${r.tasks.length} in hand` : '· free'}
            </Tag>
          ))}
        </Space>
      </Card>
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

function TaskDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useDeliveryTask(id);
  const t = q.data;
  const canManage = useCan('DELIVERY_TASKS_MANAGE');
  const { message, modal } = AntApp.useApp();
  const [assigning, setAssigning] = useState(false);
  const act = useDeliveryMutation(({ kind, reason }: { kind: 'unassign' | 'redispatch' | 'reattempt'; reason?: string }) =>
    kind === 'unassign' ? deliveryApi.unassign(id!, reason!) : kind === 'redispatch' ? deliveryApi.redispatch(id!) : deliveryApi.reattempt(id!));
  const run = (kind: 'unassign' | 'redispatch' | 'reattempt', ok: string, reason?: string) =>
    act.mutate({ kind, reason }, { onSuccess: () => message.success(ok), onError: (e) => message.error(apiErrorMessage(e)) });

  if (!id) return null;
  return (
    <Drawer open width={Math.min(640, window.innerWidth)} onClose={onClose} title={t ? `${t.taskNumber} · ${t.order?.orderNumber ?? ''}` : 'Delivery'} loading={q.isLoading}>
      {t ? (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Space wrap>
            <Tag color={STATUS[t.status].color}>{STATUS[t.status].label}</Tag>
            {t.speed === 'QUICK' ? <Tag color="orange">Quick</Tag> : null}
            {t.zone ? <Tag>{t.zone.name}</Tag> : null}
          </Space>
          {canManage ? (
            <Space wrap>
              {['READY_FOR_PICKUP', 'OFFERED', 'ASSIGNED'].includes(t.status) ? <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAssigning(true)}>{t.rider ? 'Reassign rider' : 'Assign rider'}</Button> : null}
              {['READY_FOR_PICKUP'].includes(t.status) ? <Button onClick={() => run('redispatch', 'Offering to riders again')}>Offer to riders again</Button> : null}
              {['ASSIGNED', 'AT_PICKUP'].includes(t.status) ? (
                <Button danger onClick={() => { let reason = ''; modal.confirm({ title: 'Take the task back from the rider?', content: <Input placeholder="Reason" onChange={(e) => (reason = e.target.value)} />, onOk: () => run('unassign', 'Taken back - offering again', reason || 'Taken back by staff') }); }}>Take back</Button>
              ) : null}
              {t.status === 'RETURNED_TO_STORE' ? <Button type="primary" onClick={() => run('reattempt', 'New attempt created')}>Re-attempt delivery</Button> : null}
            </Space>
          ) : null}
          {t.status === 'RETURNED_TO_STORE' ? <Alert type="info" showIcon message="The goods are back at the store. The order is still open (not cancelled) - re-attempt, or resolve it with the customer." /> : null}
          <Descriptions bordered size="small" column={1} items={[
            { key: 'c', label: 'Customer', children: `${t.dropName} · ${t.dropAddress}` },
            { key: 'r', label: 'Rider', children: t.rider ? `${t.rider.fullName} (${t.rider.phone})` : '—' },
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
                { title: 'Result', dataIndex: 'status' },
                { title: 'Why', dataIndex: 'rejectReason', render: (v) => v ?? '—' },
              ]} />
            </Card>
          ) : null}
        </Space>
      ) : null}
      <AssignModal open={assigning} task={t ?? null} onClose={() => setAssigning(false)} />
    </Drawer>
  );
}

function AssignModal({ open, task, onClose }: { open: boolean; task: DeliveryTaskRow | null; onClose: () => void }) {
  const riders = useRiders({ status: 'ACTIVE', warehouseId: task?.warehouse.id });
  const [riderId, setRiderId] = useState<string>();
  const { message } = AntApp.useApp();
  const m = useDeliveryMutation(() => deliveryApi.assign(task!.id, riderId!));
  return (
    <Modal open={open} title="Assign a rider" okText="Assign" okButtonProps={{ disabled: !riderId }} confirmLoading={m.isPending} onCancel={onClose} destroyOnClose
      onOk={() => m.mutate(undefined, { onSuccess: () => { message.success('Assigned - the rider has been notified'); onClose(); }, onError: (e) => message.error(apiErrorMessage(e)) })}>
      <Typography.Paragraph type="secondary">Active riders of {task?.warehouse.name}. Any request showing to another rider is withdrawn.</Typography.Paragraph>
      <Select style={{ width: '100%' }} placeholder="Choose a rider" value={riderId} onChange={setRiderId}
        options={(riders.data ?? []).map((r) => ({ value: r.id, label: `${r.fullName} · ${r.availability.toLowerCase()}${r.activeTasks ? ` · ${r.activeTasks} in hand` : ''}` }))} />
    </Modal>
  );
}
