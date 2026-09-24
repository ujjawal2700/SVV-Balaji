import { Alert, App as AntApp, Button, Descriptions, Form, Input, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { apiErrorMessage } from '@shared/api/client';
import { checkoutAdminApi, type PickPlanRow, type ScanResult } from '@shared/api/checkout';
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
      message.success('Rider assigned — out for delivery');
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
              {
                title: 'Batch to pull',
                dataIndex: 'fgBatchNumber',
                render: (v: string, row: PickPlanRow) => (
                  <Space size={6}>
                    <Text
                      code
                      style={{ cursor: 'pointer', color: '#1677ff' }}
                      title="Click to fill into scan input"
                      onClick={() => setScanCode(v)}
                    >
                      {v}
                    </Text>
                    {!row.scanned && order.status === 'ALLOCATED' ? (
                      <Button size="small" type="link" onClick={() => void handleScanBatch(v)} style={{ fontSize: 11, padding: 0 }}>
                        Verify
                      </Button>
                    ) : null}
                  </Space>
                ),
              },
              { title: 'Expires', dataIndex: 'expiryDate', render: (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : '—') },
              { title: 'Packs', dataIndex: 'quantity', align: 'right' },
              { title: 'Scanned', dataIndex: 'scanned', render: (v: boolean) => (v ? <Tag color="green">✓ Scanned</Tag> : <Tag color="orange">Pending</Tag>) },
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
        <Can do="ORDER_DISPATCH">
          <Form layout="inline" onFinish={() => void handleAssignRider()}>
            <Form.Item><Input placeholder="Rider name" value={rider.name} onChange={(e) => setRider({ ...rider, name: e.target.value })} /></Form.Item>
            <Form.Item><Input placeholder="Rider mobile" maxLength={10} value={rider.phone} onChange={(e) => setRider({ ...rider, phone: e.target.value })} /></Form.Item>
            <Button type="primary" htmlType="submit" loading={assignAction.isPending} disabled={rider.name.length < 2 || rider.phone.length !== 10 || busy}>Assign rider & send out</Button>
          </Form>
        </Can>
      ) : null}

      {order.status === 'PACKED' && !local ? (
        <Can do="ORDER_DISPATCH">
          <Button type="primary" loading={shipAction.isPending} disabled={busy} onClick={() => void handleShip()}>
            Create Shiprocket shipment (AWB) & dispatch
          </Button>
        </Can>
      ) : null}

      {order.status === 'DISPATCHED' && local ? (
        <Can do="ORDER_DELIVER">
          <Alert type="info" showIcon message="Ask the customer for the OTP shown in their app, then enter it here." style={{ marginBottom: 8 }} />
          <Form layout="inline" onFinish={() => void handleVerifyOtp()}>
            <Form.Item><Input placeholder="Customer OTP" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} style={{ width: 160 }} /></Form.Item>
            <Button type="primary" htmlType="submit" loading={verifyAction.isPending} disabled={otp.length < 4 || busy}>Verify & deliver</Button>
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
