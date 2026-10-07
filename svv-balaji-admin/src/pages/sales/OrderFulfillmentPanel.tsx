import { Alert, App as AntApp, Button, Card, Descriptions, Form, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import { checkoutAdminApi, type PickPlanRow, type ScanResult } from '@shared/api/checkout';
import { useFulfillmentAction, usePickPlan } from '@shared/hooks/useCheckoutAdmin';
import { useRiders } from '@shared/hooks/useDelivery';
import type { OrderDeliveryTask } from '@shared/api/types';
import { Can } from '../../components/Can';
import { liveTask } from './fulfilmentGuide';

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
  deliveryTask?: OrderDeliveryTask | null;
}

const TASK_LABEL: Record<string, { label: string; color: string }> = {
  READY_FOR_PICKUP: { label: 'Waiting for a rider', color: 'gold' },
  OFFERED: { label: 'Offered to riders', color: 'blue' },
  ASSIGNED: { label: 'Rider coming to store', color: 'geekblue' },
  AT_PICKUP: { label: 'Rider at store', color: 'purple' },
  PICKED_UP: { label: 'Picked up', color: 'cyan' },
  OUT_FOR_DELIVERY: { label: 'On the way', color: 'cyan' },
  AT_DROP: { label: 'At customer', color: 'cyan' },
  FAILED: { label: 'Failed - returning to store', color: 'red' },
};

/** Counts down from the server-measured seconds, so a wrong PC clock cannot show the wrong time left. */
function SecondsLeft({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return <Tag color={left <= 10 ? 'red' : 'orange'} style={{ marginInlineEnd: 0 }}>{left > 0 ? `${left}s left` : 'closing…'}</Tag>;
}

/** The rider-app side of a local delivery: who it is offered to, or who has it. */
function DeliveryTaskCard({ task }: { task: OrderDeliveryTask | null }) {
  if (!task) {
    return <Alert type="info" showIcon message="Creating the delivery and looking for the nearest rider…" />;
  }
  const st = TASK_LABEL[task.status] ?? { label: task.status, color: 'default' };
  return (
    <Card
      size="small"
      style={{ borderRadius: 10 }}
      title={
        <Space size={8}>
          <Text strong>Delivery {task.taskNumber}</Text>
          <Tag color={st.color}>{st.label}</Tag>
          {task.attempt > 1 ? <Tag>Attempt {task.attempt}</Tag> : null}
        </Space>
      }
      extra={<Link to="/delivery-board">Delivery board</Link>}
    >
      {task.rider ? (
        <Text>
          Rider: <Text strong>{task.rider.fullName}</Text> ({task.rider.phone})
        </Text>
      ) : task.offers.length ? (
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Text type="secondary">Round {task.offerRound} - the first rider to accept gets it:</Text>
          {task.offers.map((o) => (
            <Space key={o.id} size={8}>
              <Text>{o.rider.fullName}</Text>
              <SecondsLeft seconds={o.secondsLeft} />
            </Space>
          ))}
        </Space>
      ) : task.autoDispatchPaused ? (
        <Text type="warning">Auto-offer is paused - assign a rider below.</Text>
      ) : task.needsManualAssignment ? (
        <Text type="warning">No rider accepted - assign one below.</Text>
      ) : (
        <Text type="secondary">Looking for the next available rider…</Text>
      )}
    </Card>
  );
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
  const [showAssign, setShowAssign] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const task = liveTask(order);
  const riderHasIt = !!task?.rider;
  const showPlan = ['ALLOCATED', 'PACKED', 'DISPATCHED', 'DELIVERED'].includes(order.status);
  const plan = usePickPlan(order.id, showPlan);
  const activeRidersQuery = useRiders({ status: 'ACTIVE' });
  const activeRiders = activeRidersQuery.data ?? [];

  const startAction = useFulfillmentAction(() => checkoutAdminApi.startPacking(order.id));
  const assignAction = useFulfillmentAction((r: { name: string; phone: string }) => checkoutAdminApi.assignRider(order.id, r.name, r.phone));
  const shipAction = useFulfillmentAction(() => checkoutAdminApi.ship(order.id));
  const verifyAction = useFulfillmentAction((code: string) => checkoutAdminApi.verifyOtp(order.id, code));
  const scanAction = useFulfillmentAction((code: string) => checkoutAdminApi.scan(order.id, code));

  const handleStartPacking = async () => {
    try {
      await startAction.mutateAsync(undefined as never);
      message.success('Packing started — pick the listed batches');
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not start packing'), 6);
    }
  };

  const handleAssignRider = async () => {
    try {
      await assignAction.mutateAsync(rider);
      const digits = (v: string) => v.replace(/\D/g, '').slice(-10);
      const registered = activeRiders.some((r) => digits(r.phone) === digits(rider.phone));
      message.success(registered ? 'Rider assigned - the order goes out when they pick it up in the app' : 'Handed to the driver - out for delivery');
      setShowAssign(false);
      setRider({ name: '', phone: '' });
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not assign rider'), 6);
    }
  };

  const handleShip = async () => {
    try {
      await shipAction.mutateAsync(undefined as never);
      message.success('Shipment created and dispatched');
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not create shipment'), 6);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      await verifyAction.mutateAsync(otp);
      setOtp('');
      message.success('OTP verified — order delivered');
    } catch (e) {
      message.error(apiErrorMessage(e, 'Invalid OTP'), 6);
    }
  };

  const handleScanBatch = async (codeToScan?: string) => {
    const code = (codeToScan || scanCode).trim();
    if (!code) return;
    try {
      const res = (await scanAction.mutateAsync(code)) as ScanResult;
      setScanCode('');
      if (res.packed) {
        message.success('🎉 All allocated batches verified! Order is now PACKED & ready for dispatch.', 5);
      } else {
        message.success(`✓ Batch ${res.scanned} verified successfully! (${res.remaining} remaining)`, 4);
      }
    } catch (e) {
      const err = apiErrorMessage(e, 'Could not verify batch label');
      message.warning(`Batch scan notice: ${err}`, 6);
    }
  };

  const handleVerifyAllBatches = async () => {
    const unscanned = (plan.data ?? []).filter((r) => !r.scanned);
    if (!unscanned.length) return;
    try {
      for (const row of unscanned) {
        await scanAction.mutateAsync(row.fgBatchNumber);
      }
      message.success('🎉 All allocated batches verified successfully! Order is now PACKED.', 5);
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not verify batches'), 6);
    }
  };

  const local = order.fulfillmentMethod === 'LOCAL';
  const busy = scanAction.isPending || startAction.isPending || assignAction.isPending || shipAction.isPending || verifyAction.isPending;

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
          <Button type="primary" loading={startAction.isPending} disabled={busy} onClick={() => void handleStartPacking()}>
            Start packing (FIFO batch allocation)
          </Button>
        </Can>
      ) : null}

      {showPlan ? (
        <div id="pick-list-section" style={{ scrollMarginTop: 80, padding: 12, background: order.status === 'ALLOCATED' ? '#fefce8' : 'transparent', borderRadius: 10, border: order.status === 'ALLOCATED' ? '1px solid #fef08a' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Text strong style={{ fontSize: 14 }}>Pick list (oldest expiry first)</Text>
              {order.status === 'ALLOCATED' && (plan.data ?? []).some((r) => !r.scanned) && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Click <strong>Verify Batch</strong> or <strong>Verify All Batches</strong> to confirm items before packing.
                </Text>
              )}
            </div>
            {order.status === 'ALLOCATED' && (plan.data ?? []).some((r) => !r.scanned) ? (
              <Button
                size="small"
                type="primary"
                onClick={() => void handleVerifyAllBatches()}
                loading={scanAction.isPending}
                style={{ borderRadius: 6, backgroundColor: '#16a34a', borderColor: '#16a34a', fontWeight: 600 }}
              >
                ✓ Verify All Batches
              </Button>
            ) : null}
          </div>
          <Table<PickPlanRow>
            size="small"
            style={{ marginTop: 8 }}
            scroll={{ x: 680 }}
            rowKey="allocationId"
            pagination={false}
            loading={plan.isLoading}
            dataSource={plan.data ?? []}
            columns={[
              {
                title: 'Product',
                dataIndex: 'product',
                width: 220,
                render: (v: string) => <Text strong style={{ fontSize: 13, color: '#1e293b' }}>{v}</Text>,
              },
              {
                title: 'Batch to pull',
                dataIndex: 'fgBatchNumber',
                width: 280,
                render: (v: string, row: PickPlanRow) => (
                  <Space size={8} align="center" style={{ whiteSpace: 'nowrap' }}>
                    <Text
                      code
                      style={{
                        cursor: 'pointer',
                        color: '#2563eb',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        background: '#eff6ff',
                        borderColor: '#bfdbfe',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 12.5,
                        display: 'inline-block',
                      }}
                      title="Click to fill into scan input"
                      onClick={() => setScanCode(v)}
                    >
                      {v}
                    </Text>
                    {!row.scanned && order.status === 'ALLOCATED' ? (
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => void handleScanBatch(v)}
                        style={{ fontSize: 11, borderRadius: 6, height: 24, padding: '0 10px', backgroundColor: '#2563eb', fontWeight: 600 }}
                      >
                        Verify Batch
                      </Button>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: 'Expires',
                dataIndex: 'expiryDate',
                width: 110,
                align: 'center',
                render: (v: string | null) => (
                  <span style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: '#475569' }}>
                    {v ? new Date(v).toLocaleDateString('en-IN') : '—'}
                  </span>
                ),
              },
              {
                title: 'Packs',
                dataIndex: 'quantity',
                width: 80,
                align: 'right',
                render: (v: number) => <strong style={{ fontSize: 13, color: '#0f172a' }}>{v}</strong>,
              },
              {
                title: 'Scanned',
                dataIndex: 'scanned',
                width: 150,
                align: 'center',
                render: (v: boolean) => (
                  v ? <Tag color="green" style={{ margin: 0, padding: '2px 10px', fontWeight: 600, borderRadius: 6 }}>✓ Scanned</Tag>
                    : <Tag color="orange" style={{ margin: 0, padding: '2px 10px', fontWeight: 600, borderRadius: 6 }}>Pending Verification</Tag>
                ),
              },
            ]}
          />
        </div>
      ) : null}

      {order.status === 'ALLOCATED' ? (
        <Can do="ORDER_PACK">
          <Form layout="inline" onFinish={() => void handleScanBatch()}>
            <Form.Item>
              <Input
                autoFocus
                placeholder="Scan or click batch label above (FG-...)"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                style={{ width: 320 }}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" disabled={!scanCode.trim() || busy}>
              Scan &amp; Verify Batch
            </Button>
          </Form>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            Click any batch number above or scan the barcode label. Order status automatically advances to <strong>PACKED</strong> once all allocated batches are verified.
          </Text>
        </Can>
      ) : null}

      {order.status === 'PACKED' && local ? (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <DeliveryTaskCard task={task} />
          <Can do="ORDER_DISPATCH">
            {riderHasIt && !showAssign ? (
              <Button onClick={() => setShowAssign(true)}>Assign a different rider</Button>
            ) : (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                  {riderHasIt ? 'Give it to someone else.' : 'Or assign a rider yourself.'} A registered rider gets it in their app and the order
                  goes out at pickup; anyone else is treated as an outside driver and the order goes out now.
                </Text>
                <Form layout="inline" onFinish={() => void handleAssignRider()}>
            {activeRiders.length > 0 && (
              <Form.Item>
                <Select
                  placeholder="Select registered rider"
                  style={{ minWidth: 200 }}
                  allowClear
                  onChange={(val) => {
                    const selected = activeRiders.find((r) => r.id === val);
                    if (selected) {
                      setRider({ name: selected.fullName, phone: selected.phone });
                    }
                  }}
                  options={activeRiders.map((r) => ({
                    value: r.id,
                    label: `${r.fullName} (${r.phone})`,
                  }))}
                />
              </Form.Item>
            )}
            <Form.Item><Input placeholder="Rider name" value={rider.name} onChange={(e) => setRider({ ...rider, name: e.target.value })} /></Form.Item>
            <Form.Item><Input placeholder="Rider mobile" maxLength={10} value={rider.phone} onChange={(e) => setRider({ ...rider, phone: e.target.value })} /></Form.Item>
            <Button type="primary" htmlType="submit" loading={assignAction.isPending} disabled={rider.name.length < 2 || rider.phone.length !== 10 || busy}>Assign rider</Button>
          </Form>
              </div>
            )}
          </Can>
        </Space>
      ) : null}

      {order.status === 'PACKED' && !local ? (
        <Can do="ORDER_DISPATCH">
          <Button type="primary" loading={shipAction.isPending} disabled={busy} onClick={() => void handleShip()}>
            Create Shiprocket shipment (AWB) & dispatch
          </Button>
        </Can>
      ) : null}

      {order.status === 'DISPATCHED' && local ? (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {task ? <DeliveryTaskCard task={task} /> : null}
          <Can do="ORDER_DELIVER">
            {riderHasIt && !showOtp ? (
              <Button onClick={() => setShowOtp(true)}>Rider cannot enter the OTP? Enter it here</Button>
            ) : (
              <>
                <Alert type="info" showIcon message="Ask the customer for the OTP shown in their app, then enter it here." style={{ marginBottom: 8 }} />
                <Form layout="inline" onFinish={() => void handleVerifyOtp()}>
                  <Form.Item><Input placeholder="Customer OTP" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} style={{ width: 160 }} /></Form.Item>
                  <Button type="primary" htmlType="submit" loading={verifyAction.isPending} disabled={otp.length < 4 || busy}>Verify & deliver</Button>
                </Form>
              </>
            )}
          </Can>
        </Space>
      ) : null}

      {order.status === 'DISPATCHED' && !local ? (
        <Alert type="info" showIcon message="With the courier. The order closes automatically when Shiprocket reports delivery." />
      ) : null}
      {order.status === 'DELIVERED' ? <Alert type="success" showIcon message="Delivered. Loyalty points were credited on delivery." /> : null}
    </Space>
  );
}
