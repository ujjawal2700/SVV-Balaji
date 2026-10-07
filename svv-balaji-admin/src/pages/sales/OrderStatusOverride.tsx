import { EditOutlined } from '@ant-design/icons';
import { Alert, App as AntApp, Button, Input, Modal, Radio, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { checkoutAdminApi } from '@shared/api/checkout';
import type { OrderStatus, OverrideStatusResult } from '@shared/api/types';
import { useFulfillmentAction } from '@shared/hooks/useCheckoutAdmin';
import { Can } from '../../components/Can';
import { ORDER_STATUS_COLOUR, ORDER_STATUS_LABEL } from './orderStatus';

const { Text } = Typography;

const FLOW: OrderStatus[] = ['PLACED', 'CONFIRMED', 'ALLOCATED', 'PACKED', 'DISPATCHED', 'DELIVERED'];
const AFTER_DISPATCH = FLOW.indexOf('DISPATCHED');

interface Option {
  status: OrderStatus;
  effect: string;
  /** Why it cannot be chosen; absent when it can. */
  blocked?: string;
}

/**
 * Every status the order could be moved to, with what moving there really does
 * (mirrors SalesService.overrideStatus - the server enforces the same rules).
 */
function options(from: string): Option[] {
  const fi = FLOW.indexOf(from as OrderStatus);
  const goneOut = fi >= AFTER_DISPATCH;
  const list: Option[] = FLOW.filter((s) => s !== from).map((s) => {
    const ti = FLOW.indexOf(s);
    if (ti > fi) {
      const effects: string[] = [];
      if (fi < 2 && ti >= 2) effects.push('reserves batches oldest-expiry first');
      if (fi < 3 && ti >= 3) effects.push('marks every batch as checked (no scan)');
      if (fi < 4 && ti >= 4) effects.push('moves stock out and raises the tax invoice; riders still waiting are released');
      if (ti === 5) effects.push('closes the order without the OTP and credits loyalty; any rider delivery is cancelled');
      return { status: s, effect: effects.length ? `Forward: ${effects.join('; ')}.` : 'Forward one step.' };
    }
    if (goneOut) return { status: s, effect: '', blocked: 'Goods have left the store - record a return instead' };
    if (s === 'ALLOCATED') return { status: s, effect: 'Back: batch scans are cleared so the order is packed again; any rider is released.' };
    if (s === 'CONFIRMED') return { status: s, effect: 'Back: batch reservations are released - start packing again to re-allocate; any rider is released.' };
    return { status: s, effect: '', blocked: 'An order cannot be moved back to Placed' };
  });
  list.push(
    goneOut || from === 'CANCELLED'
      ? { status: 'CANCELLED', effect: '', blocked: from === 'CANCELLED' ? 'Already cancelled' : 'Dispatched orders are returned, not cancelled' }
      : { status: 'CANCELLED', effect: 'Releases all stock, coupon, coins and wallet money (normal cancel rules).' },
  );
  return list;
}

/** "Change status" - the manual override for when the normal flow cannot be followed (scanner down, rider phone dead...). */
export function OrderStatusOverride({ order }: { order: { id: string; orderNumber: string; status: string } }) {
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const action = useFulfillmentAction((v: { to: OrderStatus; reason: string }) => checkoutAdminApi.overrideStatus(order.id, v.to, v.reason));

  if (order.status === 'CANCELLED' || order.status === 'DRAFT') return null;
  const opts = options(order.status);
  const chosen = opts.find((o) => o.status === to);

  const close = () => {
    setOpen(false);
    setTo(null);
    setReason('');
  };

  const submit = async () => {
    if (!to) return;
    try {
      const r = (await action.mutateAsync({ to, reason: reason.trim() })) as OverrideStatusResult;
      if (r.shortfalls?.length) message.warning(`Moved to ${ORDER_STATUS_LABEL[to]}, but some lines were short on stock - check the pick list`, 8);
      else message.success(`Order ${order.orderNumber} moved to ${ORDER_STATUS_LABEL[to]}`);
      close();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not change the status'), 8);
    }
  };

  return (
    <Can do="ORDER_OVERRIDE">
      <Button icon={<EditOutlined />} onClick={() => setOpen(true)} style={{ borderRadius: 8 }}>
        Change status
      </Button>
      <Modal
        open={open}
        onCancel={close}
        title={`Change status of ${order.orderNumber}`}
        okText={to ? `Move to ${ORDER_STATUS_LABEL[to]}` : 'Choose a status'}
        okButtonProps={{ disabled: !to || !!chosen?.blocked || reason.trim().length < 5, danger: to === 'CANCELLED', loading: action.isPending }}
        onOk={() => void submit()}
        width={560}
        destroyOnClose
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="Manual override"
            description="Use this only when the normal flow cannot be followed. It skips the batch scan, rider and OTP checks; stock, invoice and loyalty still move. Your name and reason are kept on the order's timeline."
          />
          <div>
            <Text type="secondary">Now: </Text>
            <Tag color={ORDER_STATUS_COLOUR[order.status]}>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Tag>
          </div>
          <Radio.Group value={to} onChange={(e) => setTo(e.target.value)} style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {opts.map((o) => (
                <Radio key={o.status} value={o.status} disabled={!!o.blocked}>
                  <Tag color={ORDER_STATUS_COLOUR[o.status]} style={{ marginRight: 6 }}>{ORDER_STATUS_LABEL[o.status]}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>{o.blocked ?? o.effect}</Text>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
          <Input.TextArea
            rows={3}
            maxLength={300}
            showCount
            placeholder="Reason (required) - e.g. Scanner down, packed and checked by hand"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Space>
      </Modal>
    </Can>
  );
}
