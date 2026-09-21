import { Alert, App as AntApp, Button, Descriptions, Form, Input, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { checkoutAdminApi, type PickPlanRow } from '@shared/api/checkout';
import { useFulfillmentAction, usePickPlan } from '@shared/hooks/useCheckoutAdmin';
import { Can } from '../../components/Can';

const { Text } = Typography;

interface OrderLite {
  id: string;
  status: string;
  fulfillmentMethod?: 'LOCAL' | 'SHIPROCKET' | null;
  riderName?: string | null;
  riderPhone?: string | null;
  paymentMode?: string | null;
  paymentStatus?: string;
  etaMin?: string | null;
  etaMax?: string | null;
  distanceKm?: string | null;
  shipment?: { awb?: string | null; courier?: string | null; trackingUrl?: string | null } | null;
}

/**
 * The store / warehouse floor for one storefront order, one step at a time:
 * start packing (FIFO picks the oldest valid batches) -> scan each batch label
 * -> rider or shipment -> doorstep OTP. The server refuses to skip a step, so
 * this panel only ever offers the next legal action.
 */
export function OrderFulfillmentPanel({ order }: { order: OrderLite }) {
  const { message } = AntApp.useApp();
  const [scanCode, setScanCode] = useState('');
  const [otp, setOtp] = useState('');
  const [rider, setRider] = useState({ name: '', phone: '' });
  const showPlan = ['ALLOCATED', 'PACKED', 'DISPATCHED', 'DELIVERED'].includes(order.status);
  const plan = usePickPlan(order.id, showPlan);

  const run = <T,>(label: string, fn: (v: T) => Promise<unknown>) => {
    const action = useFulfillmentAction(fn);
    return { action, go: async (v: T) => {
      try {
        await action.mutateAsync(v);
        message.success(label);
      } catch (e) {
        message.error(apiErrorMessage(e, 'That step could not be completed'), 8);
      }
    } };
  };

  const start = run('Packing started — pick the listed batches', () => checkoutAdminApi.startPacking(order.id));
  const scan = run('Batch scanned', (code: string) => checkoutAdminApi.scan(order.id, code));
  const assign = run('Rider assigned — out for delivery', (r: { name: string; phone: string }) => checkoutAdminApi.assignRider(order.id, r.name, r.phone));
  const ship = run('Shipment created and dispatched', () => checkoutAdminApi.ship(order.id));
  const verify = run('OTP verified — order delivered', (code: string) => checkoutAdminApi.verifyOtp(order.id, code));

  const local = order.fulfillmentMethod === 'LOCAL';
  const busy = [start, scan, assign, ship, verify].some((a) => a.action.isPending);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
        <Descriptions.Item label="Method">
          <Tag color={local ? 'green' : 'blue'}>{local ? 'LOCAL (in-house rider)' : 'SHIPROCKET (courier)'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Payment">{order.paymentMode} · {order.paymentStatus}</Descriptions.Item>
        {order.riderName ? <Descriptions.Item label="Rider">{order.riderName} ({order.riderPhone})</Descriptions.Item> : null}
        {order.shipment?.awb ? (
          <Descriptions.Item label="Shipment">
            {order.shipment.courier} · AWB {order.shipment.awb}{' '}
            {order.shipment.trackingUrl ? <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">track</a> : null}
          </Descriptions.Item>
        ) : null}
      </Descriptions>

      {['PLACED', 'CONFIRMED'].includes(order.status) ? (
        <Can do="ORDER_ALLOCATE">
          <Button type="primary" loading={start.action.isPending} disabled={busy} onClick={() => void start.go(undefined as never)}>
            Start packing (FIFO batch allocation)
          </Button>
        </Can>
      ) : null}

      {showPlan ? (
        <div>
          <Text strong>Pick list (oldest expiry first)</Text>
          <Table<PickPlanRow>
            size="small"
            style={{ marginTop: 8 }}
            rowKey="allocationId"
            pagination={false}
            loading={plan.isLoading}
            dataSource={plan.data ?? []}
            columns={[
              { title: 'Product', dataIndex: 'product' },
              { title: 'Batch to pull', dataIndex: 'fgBatchNumber', render: (v: string) => <Text code>{v}</Text> },
              { title: 'Expires', dataIndex: 'expiryDate', render: (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—') },
              { title: 'Packs', dataIndex: 'quantity', align: 'right' },
              { title: 'Scanned', dataIndex: 'scanned', render: (v: boolean) => (v ? <Tag color="green">✓</Tag> : <Tag>pending</Tag>) },
            ]}
          />
        </div>
      ) : null}

      {order.status === 'ALLOCATED' ? (
        <Can do="ORDER_PACK">
          <Form layout="inline" onFinish={() => { void scan.go(scanCode).then(() => setScanCode('')); }}>
            <Form.Item>
              <Input autoFocus placeholder="Scan / type the batch label (FG-…)" value={scanCode} onChange={(e) => setScanCode(e.target.value)} style={{ width: 300 }} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={scan.action.isPending} disabled={!scanCode.trim() || busy}>Scan batch</Button>
          </Form>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            Only the listed batches are accepted. The order becomes PACKED when every batch is scanned.
          </Text>
        </Can>
      ) : null}

      {order.status === 'PACKED' && local ? (
        <Can do="ORDER_DISPATCH">
          <Form layout="inline" onFinish={() => void assign.go(rider)}>
            <Form.Item><Input placeholder="Rider name" value={rider.name} onChange={(e) => setRider({ ...rider, name: e.target.value })} /></Form.Item>
            <Form.Item><Input placeholder="Rider mobile" maxLength={10} value={rider.phone} onChange={(e) => setRider({ ...rider, phone: e.target.value })} /></Form.Item>
            <Button type="primary" htmlType="submit" loading={assign.action.isPending} disabled={rider.name.length < 2 || rider.phone.length !== 10 || busy}>Assign rider & send out</Button>
          </Form>
        </Can>
      ) : null}

      {order.status === 'PACKED' && !local ? (
        <Can do="ORDER_DISPATCH">
          <Button type="primary" loading={ship.action.isPending} disabled={busy} onClick={() => void ship.go(undefined as never)}>
            Create Shiprocket shipment (AWB) & dispatch
          </Button>
        </Can>
      ) : null}

      {order.status === 'DISPATCHED' && local ? (
        <Can do="ORDER_DELIVER">
          <Alert type="info" showIcon message="Ask the customer for the OTP shown in their app, then enter it here." style={{ marginBottom: 8 }} />
          <Form layout="inline" onFinish={() => { void verify.go(otp).then(() => setOtp('')); }}>
            <Form.Item><Input placeholder="Customer OTP" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} style={{ width: 160 }} /></Form.Item>
            <Button type="primary" htmlType="submit" loading={verify.action.isPending} disabled={otp.length < 4 || busy}>Verify & deliver</Button>
          </Form>
        </Can>
      ) : null}

      {order.status === 'DISPATCHED' && !local ? (
        <Alert type="info" showIcon message="With the courier. The order closes automatically when Shiprocket reports delivery." />
      ) : null}
      {order.status === 'DELIVERED' ? <Alert type="success" showIcon message="Delivered. Loyalty points were credited on delivery." /> : null}
    </Space>
  );
}
