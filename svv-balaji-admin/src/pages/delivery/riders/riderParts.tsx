import { App as AntApp, Avatar, Badge, Form, Image, Input, InputNumber, Modal, Select, Space, Tag, Typography } from 'antd';
import { apiErrorMessage } from '@shared/api/client';
import { deliveryApi, type RiderStatus, type TaskStatus } from '@shared/api/delivery';
import { useDeliveryMutation } from '@shared/hooks/useDelivery';
import { useWarehouses } from '../../../hooks/useWarehouses';

/** Pieces shared by the Manage Riders screens (pending, all, detail, earnings, cash, live). */

export const inr = (n: number | string) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const listOf = <T,>(x: unknown): T[] => (Array.isArray(x) ? x : ((x as { data?: T[] })?.data ?? [])) as T[];

export const RIDER_STATUS: Record<RiderStatus, { label: string; color: string }> = {
  PENDING_VERIFICATION: { label: 'Phone not verified', color: 'default' },
  PENDING_APPROVAL: { label: 'Awaiting approval', color: 'gold' },
  ACTIVE: { label: 'Active', color: 'green' },
  SUSPENDED: { label: 'Suspended', color: 'red' },
  REJECTED: { label: 'Rejected', color: 'default' },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; color: string }> = {
  READY_FOR_PICKUP: { label: 'Ready for pickup', color: 'gold' }, OFFERED: { label: 'Offered', color: 'orange' }, ASSIGNED: { label: 'Rider assigned', color: 'blue' },
  AT_PICKUP: { label: 'Rider at store', color: 'blue' }, PICKED_UP: { label: 'Picked up', color: 'geekblue' }, OUT_FOR_DELIVERY: { label: 'Out for delivery', color: 'purple' },
  AT_DROP: { label: 'At customer', color: 'purple' }, DELIVERED: { label: 'Delivered', color: 'green' }, FAILED: { label: 'Failed - returning', color: 'red' },
  RETURNED_TO_STORE: { label: 'Back at store', color: 'volcano' }, CANCELLED: { label: 'Cancelled', color: 'default' },
};

export const VEHICLE_LABEL: Record<string, string> = { BICYCLE: 'Bicycle', MOTORCYCLE: 'Motorcycle', SCOOTER: 'Scooter', EV_SCOOTER: 'EV scooter', OTHER: 'Other' };
export const vehicleText = (type: string | null, number: string | null) => [type ? VEHICLE_LABEL[type] ?? type : null, number].filter(Boolean).join(' · ') || '—';

export function StatusTag({ status }: { status: RiderStatus }) {
  return <Tag color={RIDER_STATUS[status].color}>{RIDER_STATUS[status].label}</Tag>;
}

/** Avatar with an online dot, name, code and phone. */
export function RiderCell({
  rider, onOpen, sub,
}: {
  rider: { fullName: string; code: string | null; phone: string; photoUrl?: string | null; availability?: 'ONLINE' | 'OFFLINE' };
  onOpen?: () => void;
  sub?: string;
}) {
  return (
    <Space style={{ whiteSpace: 'nowrap' }}>
      <Badge dot color={rider.availability === 'ONLINE' ? 'green' : '#d9d9d9'} offset={[-4, 30]}>
        <Avatar src={rider.photoUrl ?? undefined} style={{ background: '#ff8a00' }}>{rider.fullName.charAt(0)}</Avatar>
      </Badge>
      <div>
        {onOpen ? <a onClick={onOpen} style={{ fontWeight: 600 }}>{rider.fullName}</a> : <b>{rider.fullName}</b>}
        <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{sub ?? `${rider.code ?? 'no code yet'} · ${rider.phone}`}</Typography.Text></div>
      </div>
    </Space>
  );
}

type Actionable = { id: string; fullName: string };

/** Reject / suspend (with a reason) and reactivate, with their confirmations. */
export function useRiderActions() {
  const { message, modal } = AntApp.useApp();
  const act = useDeliveryMutation(({ kind, id, reason }: { kind: 'reject' | 'suspend' | 'reactivate'; id: string; reason?: string }) =>
    kind === 'reject' ? deliveryApi.rejectRider(id, reason!) : kind === 'suspend' ? deliveryApi.suspendRider(id, reason!) : deliveryApi.reactivateRider(id));

  const withReason = (kind: 'reject' | 'suspend', r: Actionable) => {
    let reason = '';
    modal.confirm({
      title: kind === 'reject' ? `Reject ${r.fullName}'s application?` : `Suspend ${r.fullName}?`,
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {kind === 'reject' ? 'The rider sees this reason in the app.' : 'The rider is signed out on every device at once and cannot go online.'}
          </Typography.Text>
          <Input.TextArea rows={2} placeholder="Reason (shown to the rider)" onChange={(e) => (reason = e.target.value)} />
        </Space>
      ),
      okText: kind === 'reject' ? 'Reject' : 'Suspend',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (reason.trim().length < 3) {
          message.error('Give a reason');
          throw new Error('reason');
        }
        try {
          await act.mutateAsync({ kind, id: r.id, reason });
          message.success(kind === 'reject' ? 'Application rejected' : 'Rider suspended - signed out everywhere');
        } catch (e) {
          message.error(apiErrorMessage(e));
          throw e;
        }
      },
    });
  };

  return {
    reject: (r: Actionable) => withReason('reject', r),
    suspend: (r: Actionable) => withReason('suspend', r),
    reactivate: (r: Actionable) =>
      act.mutate({ kind: 'reactivate', id: r.id }, { onSuccess: () => message.success(`${r.fullName} reactivated`), onError: (e) => message.error(apiErrorMessage(e)) }),
    pending: act.isPending,
  };
}

/** Approve a sign-up: pick the home outlet and how many deliveries the rider may hold at once. */
export function ApproveModal({ rider, onClose }: { rider: { id: string; fullName: string; documentUrl: string | null } | null; onClose: () => void }) {
  const [form] = Form.useForm<{ warehouseId: string; maxActiveTasks: number }>();
  const warehouses = useWarehouses();
  const { message } = AntApp.useApp();
  const m = useDeliveryMutation((v: { warehouseId: string; maxActiveTasks: number }) => deliveryApi.approveRider(rider!.id, v));
  return (
    <Modal open={Boolean(rider)} title={`Approve ${rider?.fullName ?? ''}`} okText="Approve" confirmLoading={m.isPending} destroyOnHidden onCancel={onClose}
      onOk={async () => {
        const v = await form.validateFields();
        try {
          await m.mutateAsync(v);
          message.success('Approved - the rider can go online now');
          onClose();
        } catch (e) {
          message.error(apiErrorMessage(e));
        }
      }}>
      {rider?.documentUrl ? <Image src={rider.documentUrl} width={180} style={{ borderRadius: 8, marginBottom: 12 }} /> : <Typography.Paragraph type="warning">No licence photo uploaded.</Typography.Paragraph>}
      <Form form={form} layout="vertical" initialValues={{ maxActiveTasks: 1 }} preserve={false}>
        <Form.Item name="warehouseId" label="Home outlet" rules={[{ required: true, message: 'Pick the outlet this rider picks up from' }]} extra="The rider is offered deliveries picked up from here.">
          <OutletSelect homeOutlet />
        </Form.Item>
        <Form.Item name="maxActiveTasks" label="Deliveries at once" extra="1 = one order at a time. Higher lets a rider batch nearby orders.">
          <InputNumber min={1} max={5} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/**
 * Active warehouses as a searchable select. `homeOutlet` narrows it to what a
 * rider can work from: an OUTLET with map coordinates. Riders only get orders
 * routed LOCAL, and only outlets with a location are ever routed LOCAL - a
 * central warehouse ships by courier, so a rider homed there would never get work.
 */
export function OutletSelect({ homeOutlet, ...props }: { homeOutlet?: boolean; value?: string; onChange?: (v: string | undefined) => void; allowClear?: boolean; placeholder?: string; style?: React.CSSProperties }) {
  const warehouses = useWarehouses();
  const all = listOf<{ id: string; name: string; isActive: boolean; kind?: string; latitude?: string | null; longitude?: string | null }>(warehouses.data).filter((w) => w.isActive);
  const options = homeOutlet
    ? all.filter((w) => w.kind === 'OUTLET').map((w) => ({ value: w.id, label: `${w.name}${w.latitude && w.longitude ? '' : ' - no map location'}`, disabled: !(w.latitude && w.longitude) }))
    : all.map((w) => ({ value: w.id, label: w.name }));
  return <Select showSearch optionFilterProp="label" notFoundContent={homeOutlet ? 'No outlet yet - add one under Warehouses (type Outlet, with its map location)' : undefined} {...props} options={options} />;
}

/** Label for a cash-ledger line. */
export const cashEntryLabel = (t: string) => (t === 'COD_COLLECTED' ? 'COD collected' : t === 'DEPOSITED' ? 'Deposited at outlet' : t.replace(/_/g, ' ').toLowerCase());
