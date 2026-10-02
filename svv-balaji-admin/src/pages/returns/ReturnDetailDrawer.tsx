import { useQuery } from '@tanstack/react-query';
import {
  Alert, Button, Descriptions, Drawer, Form, Image, Input, InputNumber, Modal, Radio, Select, Skeleton, Space, Table, Tag, Timeline, Typography, message,
} from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@shared/api/client';
import {
  REFUND_METHOD_LABEL, RETURN_STATUS_COLOR, RETURN_STATUS_LABEL, returnsApi, type RefundMethod, type ReturnChannel, type ReturnDetail,
} from '@shared/api/returns';
import { useCanKey } from '@shared/auth/useCan';

const { Text } = Typography;
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

type Field = 'note' | 'reason' | 'reference' | 'logistics' | 'qc' | 'refund';

/** Every action the server may list in `actions`, how it is posted and what it asks for. */
const ACTIONS: Record<string, { label: string; path: string; fields: Field[]; danger?: boolean; primary?: boolean; perm: 'manage' | 'qc' | 'refund'; confirm?: string }> = {
  approve: { label: 'Approve', path: 'approve', fields: ['note', 'logistics'], primary: true, perm: 'manage' },
  reject: { label: 'Reject', path: 'reject', fields: ['reason'], danger: true, perm: 'manage' },
  cancel: { label: 'Cancel request', path: 'cancel', fields: ['reason'], danger: true, perm: 'manage' },
  schedulePickup: { label: 'Schedule pickup', path: 'schedule-pickup', fields: [], primary: true, perm: 'manage', confirm: 'Book the rider / courier pickup now?' },
  markPickedUp: { label: 'Mark picked up', path: 'picked-up', fields: ['note'], perm: 'manage' },
  markPickupFailed: { label: 'Pickup failed', path: 'pickup-failed', fields: ['reason'], danger: true, perm: 'manage' },
  receive: { label: 'Received at warehouse', path: 'receive', fields: ['note'], primary: true, perm: 'qc' },
  qc: { label: 'Record QC', path: 'qc', fields: ['qc'], primary: true, perm: 'qc' },
  markLostInTransit: { label: 'Lost / damaged in transit', path: 'lost-in-transit', fields: ['reason'], danger: true, perm: 'manage' },
  completeRefund: { label: 'Pay refund', path: 'refund', fields: ['refund'], primary: true, perm: 'refund' },
  recordDifference: { label: 'Record difference collected', path: 'difference/record', fields: ['reference'], perm: 'manage' },
  waiveDifference: { label: 'Waive difference', path: 'difference/waive', fields: ['reason'], perm: 'manage' },
  dispatchReplacement: { label: 'Dispatch replacement', path: 'dispatch-replacement', fields: [], primary: true, perm: 'manage', confirm: 'Send the replacement now? Stock leaves when the rider/courier takes it.' },
  markReplacementDelivered: { label: 'Mark replacement delivered', path: 'replacement-delivered', fields: [], perm: 'manage', confirm: 'Mark the replacement delivered and close the exchange?' },
  markReplacementFailed: { label: 'Replacement delivery failed', path: 'replacement-failed', fields: ['reason'], danger: true, perm: 'manage' },
  replacementReturned: { label: 'Replacement back in warehouse', path: 'replacement-returned', fields: [], perm: 'manage', confirm: 'The undelivered replacement is back? Its stock goes back in, still reserved.' },
  convertToRefund: { label: 'Convert to refund', path: 'convert-to-refund', fields: ['reason'], perm: 'manage' },
};

export function ReturnDetailDrawer({ channel, id, onClose, onChanged }: { channel: ReturnChannel; id: string | null; onClose: () => void; onChanged: () => void }) {
  const can = useCanKey();
  const manageKey = channel === 'B2C' ? 'returns.b2c.manage' : 'returns.b2b.manage';
  const allowed = (perm: 'manage' | 'qc' | 'refund') => can(perm === 'manage' ? manageKey : perm === 'qc' ? 'returns.qc' : 'returns.refund');
  const q = useQuery({ queryKey: ['returns', channel, 'detail', id], queryFn: () => returnsApi.detail(channel, id!), enabled: Boolean(id) });
  const [action, setAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  const r = q.data;

  const run = async (name: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const next = await returnsApi.act(channel, r!.id, ACTIONS[name].path, body);
      if (next.warning) message.warning(next.warning, 8);
      else message.success(`${ACTIONS[name].label}: done`);
      setAction(null);
      form.resetFields();
      onChanged();
      void q.refetch();
    } catch (e) {
      message.error(apiErrorMessage(e), 6);
    } finally {
      setBusy(false);
    }
  };

  const start = (name: string) => {
    const a = ACTIONS[name];
    if (a.fields.length === 0) {
      Modal.confirm({ title: a.label, content: a.confirm, okText: a.label, onOk: () => run(name) });
      return;
    }
    form.resetFields();
    if (name === 'qc' && r) form.setFieldsValue({ decision: 'ACCEPT', goodQuantity: r.quantity, damagedQuantity: 0 });
    if (name === 'completeRefund' && r) {
      form.setFieldsValue({
        refundMethod: r.refund.method && r.refund.allowedMethods.includes(r.refund.method) ? r.refund.method : r.refund.allowedMethods[0],
        upiId: r.refund.upiId, accountName: r.refund.accountName, accountNumber: r.refund.accountNumber, ifsc: r.refund.ifsc, bankName: r.refund.bankName,
      });
    }
    setAction(name);
  };

  const submit = async () => {
    const v = await form.validateFields();
    const body: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (val !== undefined && val !== null && val !== '') body[k] = val;
    await run(action!, body);
  };

  const fields = action ? ACTIONS[action].fields : [];
  const method: RefundMethod | undefined = Form.useWatch('refundMethod', form);

  return (
    <Drawer open={Boolean(id)} onClose={onClose} width={760} title={r ? <Space>{r.requestNumber}<Tag color={RETURN_STATUS_COLOR[r.status]}>{RETURN_STATUS_LABEL[r.status]}</Tag></Space> : 'Request'}
      extra={r ? <Tag color={r.type === 'RETURN' ? 'blue' : 'purple'}>{r.type === 'RETURN' ? 'Return' : 'Exchange'} · {r.logistics === 'QUICK_DELIVERY' ? 'Rider' : 'Shiprocket'}</Tag> : null}>
      {q.isLoading || !r ? <Skeleton active paragraph={{ rows: 12 }} /> : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {r.actions.length ? (
            <Space wrap>
              {r.actions.filter((a) => ACTIONS[a] && allowed(ACTIONS[a].perm)).map((a) => (
                <Button key={a} type={ACTIONS[a].primary ? 'primary' : 'default'} danger={ACTIONS[a].danger} onClick={() => start(a)}>{ACTIONS[a].label}</Button>
              ))}
            </Space>
          ) : null}
          {r.stamps.rejectedReason ? <Alert type="error" showIcon message={`Rejected: ${r.stamps.rejectedReason}`} /> : null}
          {r.stamps.failureReason && ['PICKUP_FAILED', 'DELIVERY_FAILED'].includes(r.status) ? <Alert type="warning" showIcon message={r.stamps.failureReason} /> : null}
          {r.lostInTransit ? <Alert type="warning" showIcon message="Marked lost / damaged in transit - settled without receipt" /> : null}

          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="Order"><Link to={`/${channel === 'B2C' ? 'b2c' : 'b2b'}-orders/${r.order.id}`}>{r.order.orderNumber}</Link></Descriptions.Item>
            <Descriptions.Item label="Delivered">{when(r.order.deliveredAt)}</Descriptions.Item>
            <Descriptions.Item label={channel === 'B2C' ? 'Customer' : 'Retailer'}>{r.customer.name} · {r.customer.phone}</Descriptions.Item>
            <Descriptions.Item label="Payment">{r.order.paymentMode ?? '—'} · {r.order.paymentStatus.toLowerCase()}</Descriptions.Item>
            <Descriptions.Item label="Item" span={2}>{r.item.name} ({r.item.sku}) — <strong>{r.quantity}</strong> of {r.item.orderedQuantity}</Descriptions.Item>
            <Descriptions.Item label="Reason" span={2}>{r.reason.label} {r.reason.companyFault ? <Tag color="red">our fault</Tag> : null}{r.description ? <div><Text type="secondary">{r.description}</Text></div> : null}</Descriptions.Item>
            <Descriptions.Item label="Collect from" span={2}>{r.address.fullName} · {r.address.phone}<br />{[r.address.line1, r.address.line2, r.address.city, r.address.state, r.address.pincode].filter(Boolean).join(', ')}</Descriptions.Item>
            <Descriptions.Item label="Warehouse">{r.warehouse.name}</Descriptions.Item>
            <Descriptions.Item label="Raised">{when(r.createdAt)} · {r.raisedBy === 'STAFF' ? 'by staff' : 'by customer'}</Descriptions.Item>
          </Descriptions>

          {r.mediaUrls.length ? (
            <div>
              <Text strong>Photos / videos</Text>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <Image.PreviewGroup>
                  {r.mediaUrls.map((u) => (/\.(mp4|mov)$/i.test(u) ? <video key={u} src={u} controls style={{ width: 160, borderRadius: 6 }} /> : <Image key={u} src={u} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 6 }} />))}
                </Image.PreviewGroup>
              </div>
            </div>
          ) : null}

          <Descriptions size="small" bordered column={2} title="Money">
            <Descriptions.Item label="Paid per unit">{inr(r.money.unitPaid)}</Descriptions.Item>
            <Descriptions.Item label="Paid for these units">{inr(r.money.itemValue)}</Descriptions.Item>
            {r.type === 'RETURN' ? (
              <>
                <Descriptions.Item label="Return shipping">{inr(r.money.shippingFee)}</Descriptions.Item>
                <Descriptions.Item label="Restocking">{inr(r.money.restockingFee)}</Descriptions.Item>
                <Descriptions.Item label="Refund"><strong>{inr(r.money.refundAmount)}</strong></Descriptions.Item>
                <Descriptions.Item label="Coins to give back">{r.money.loyaltyPointsToRestore + r.money.referralPointsToRestore}</Descriptions.Item>
              </>
            ) : r.exchange ? (
              <>
                <Descriptions.Item label="Replacement">{r.exchange.replacementName}</Descriptions.Item>
                <Descriptions.Item label="Replacement value">{r.exchange.replacementTotal === null ? '—' : inr(r.exchange.replacementTotal)}</Descriptions.Item>
                <Descriptions.Item label="Difference">{inr(r.exchange.priceDifference)} <Tag>{r.exchange.differenceStatus.toLowerCase()}</Tag></Descriptions.Item>
                <Descriptions.Item label="Paid from wallet">{inr(r.exchange.differencePaidWallet)}{r.exchange.differenceReference ? ` · ref ${r.exchange.differenceReference}` : ''}</Descriptions.Item>
                {r.money.refundAmount > 0 ? <Descriptions.Item label="Refund" span={2}><strong>{inr(r.money.refundAmount)}</strong></Descriptions.Item> : null}
              </>
            ) : null}
            <Descriptions.Item label="Refund method" span={2}>
              {r.refund.method ? REFUND_METHOD_LABEL[r.refund.method] : '—'}
              {r.refund.upiId ? ` · ${r.refund.upiId}` : ''}
              {r.refund.accountNumber ? ` · ${r.refund.accountName ?? ''} ${r.refund.accountNumber} ${r.refund.ifsc ?? ''}` : ''}
              {r.refund.refundedAt ? <div><Text type="success">Paid {when(r.refund.refundedAt)}{r.refund.reference ? ` · ref ${r.refund.reference}` : ''}</Text></div> : null}
            </Descriptions.Item>
          </Descriptions>

          {r.qc ? (
            <Alert type={r.qc.decision === 'ACCEPT' ? 'success' : 'error'} showIcon
              message={`QC ${r.qc.decision === 'ACCEPT' ? 'accepted' : 'rejected'} · ${r.qc.goodQuantity} good, ${r.qc.damagedQuantity} damaged`}
              description={[r.qc.notes, r.stock.map((s) => `${s.fgBatchNumber} × ${s.quantity} → ${s.disposition === 'GOOD' ? 'stock' : 'damaged'}`).join(', ')].filter(Boolean).join(' · ')} />
          ) : r.status === 'QC' && !r.qcRequired ? null : null}

          {r.exchange?.allocations.length ? (
            <Table size="small" pagination={false} rowKey={(a) => `${a.fgBatchNumber}-${a.quantity}-${a.releasedAt}`} title={() => 'Replacement stock (FIFO, reserved)'}
              dataSource={r.exchange.allocations}
              columns={[
                { title: 'Batch', dataIndex: 'fgBatchNumber' },
                { title: 'Qty', dataIndex: 'quantity' },
                { title: 'State', key: 's', render: (_, a) => (a.releasedAt ? <Tag>released · {a.releasedReason}</Tag> : a.dispatchedAt ? <Tag color="purple">dispatched</Tag> : <Tag color="gold">reserved</Tag>) },
              ]} />
          ) : null}

          {r.shipments.length ? (
            <Table size="small" pagination={false} rowKey="id" title={() => 'Courier (Shiprocket) - external status kept separately'}
              dataSource={r.shipments}
              columns={[
                { title: 'Direction', dataIndex: 'direction', render: (d: string) => (d === 'REVERSE' ? 'Pickup' : 'Replacement') },
                { title: 'AWB', key: 'awb', render: (_, s) => (s.trackingUrl ? <a href={s.trackingUrl} target="_blank" rel="noreferrer">{s.awb}</a> : s.awb) },
                { title: 'Courier', dataIndex: 'courier' },
                { title: 'Courier status', dataIndex: 'externalStatus', render: (s: string) => <Tag>{s.replace(/_/g, ' ')}</Tag> },
                { title: '', dataIndex: 'isActive', render: (a: boolean) => (a ? null : <Text type="secondary">superseded</Text>) },
              ]} />
          ) : null}

          {r.riderTasks.length ? (
            <Table size="small" pagination={false} rowKey="id" title={() => 'Rider trips'}
              dataSource={r.riderTasks}
              columns={[
                { title: 'Task', dataIndex: 'taskNumber' },
                { title: 'Kind', dataIndex: 'kind', render: (k: string) => (k === 'RETURN_PICKUP' ? 'Pickup' : 'Replacement') },
                { title: 'Rider', key: 'rider', render: (_, t) => t.rider?.fullName ?? <Text type="secondary">waiting</Text> },
                { title: 'Status', dataIndex: 'status', render: (s: string) => <Tag>{s.replace(/_/g, ' ').toLowerCase()}</Tag> },
                { title: 'Failure', key: 'f', render: (_, t) => t.failureReasonCode ? `${t.failureReasonCode}${t.failureNote ? ` - ${t.failureNote}` : ''}` : '' },
              ]} />
          ) : null}

          {r.walletTransactions.length ? (
            <div>
              <Text strong>Refund Wallet movements</Text>
              {r.walletTransactions.map((w, i) => <div key={i} style={{ fontSize: 13 }}>{w.amount > 0 ? '+' : '−'}{inr(Math.abs(w.amount))} · {w.reason.replace(/_/g, ' ').toLowerCase()} · {when(w.at)}</div>)}
            </div>
          ) : null}

          <div>
            <Text strong>Timeline</Text>
            <Timeline style={{ marginTop: 10 }} items={r.timeline.map((e) => ({
              color: e.toStatus ? RETURN_STATUS_COLOR[e.toStatus] : 'gray',
              children: (
                <div>
                  <strong>{e.toStatus ? RETURN_STATUS_LABEL[e.toStatus] : e.type.replace(/_/g, ' ').toLowerCase()}</strong>
                  <Text type="secondary" style={{ fontSize: 12 }}> · {when(e.at)} · {e.actor}</Text>
                  {e.note ? <div style={{ fontSize: 12 }}>{e.note}</div> : null}
                </div>
              ),
            }))} />
          </div>
        </Space>
      )}

      <Modal open={action !== null} title={action ? ACTIONS[action].label : ''} onCancel={() => setAction(null)} onOk={() => void submit()} confirmLoading={busy} okText={action ? ACTIONS[action].label : 'OK'} destroyOnClose>
        <Form form={form} layout="vertical">
          {fields.includes('logistics') ? (
            <Form.Item name="logistics" label="Collect via" extra="Defaults to how the order was delivered">
              <Select allowClear options={[{ value: 'QUICK_DELIVERY', label: 'Rider (Quick Delivery)' }, { value: 'SHIPROCKET', label: 'Shiprocket reverse pickup' }]} />
            </Form.Item>
          ) : null}
          {fields.includes('note') ? <Form.Item name="note" label="Note"><Input.TextArea rows={2} maxLength={500} /></Form.Item> : null}
          {fields.includes('reason') ? <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 3 }]}><Input.TextArea rows={2} maxLength={500} /></Form.Item> : null}
          {fields.includes('reference') ? <Form.Item name="reference" label="Payment reference (UPI / cash receipt / bank)" rules={[{ required: true, min: 3 }]}><Input /></Form.Item> : null}
          {fields.includes('qc') && r ? (
            <>
              <Form.Item name="decision" label="Claim">
                <Radio.Group options={[{ value: 'ACCEPT', label: 'Accept (refund / replace)' }, { value: 'REJECT', label: 'Reject (QC failed)' }]} />
              </Form.Item>
              <Space>
                <Form.Item name="goodQuantity" label="Fit to sell (back to stock)" rules={[{ required: true }]}><InputNumber min={0} max={r.quantity} /></Form.Item>
                <Form.Item name="damagedQuantity" label="Damaged" rules={[{ required: true }]}><InputNumber min={0} max={r.quantity} /></Form.Item>
              </Space>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Must add up to {r.quantity}.</Text>
              <Form.Item name="notes" label="Inspection notes"><Input.TextArea rows={2} /></Form.Item>
            </>
          ) : null}
          {fields.includes('refund') && r ? (
            <>
              <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`Refund ${inr(r.money.refundAmount)}`} />
              <Form.Item name="refundMethod" label="Method" rules={[{ required: true }]}>
                <Select options={r.refund.allowedMethods.map((m) => ({ value: m, label: REFUND_METHOD_LABEL[m] }))} />
              </Form.Item>
              {method === 'UPI' ? <Form.Item name="upiId" label="Paid to UPI id" rules={[{ required: true }]}><Input /></Form.Item> : null}
              {method === 'BANK' ? (
                <>
                  <Form.Item name="accountName" label="Account holder" rules={[{ required: true }]}><Input /></Form.Item>
                  <Form.Item name="accountNumber" label="Account number" rules={[{ required: true, pattern: /^\d{9,18}$/ }]}><Input /></Form.Item>
                  <Form.Item name="ifsc" label="IFSC" rules={[{ required: true, pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/ }]}><Input /></Form.Item>
                  <Form.Item name="bankName" label="Bank"><Input /></Form.Item>
                </>
              ) : null}
              {method === 'UPI' || method === 'BANK' ? (
                <Form.Item name="reference" label="Transaction reference (UTR / UPI ref)" rules={[{ required: true, min: 3 }]}><Input /></Form.Item>
              ) : null}
              {method === 'CREDIT_NOTE' ? <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Applied to the order's bill in Receivables; anything beyond what is owed goes to the Refund Wallet." /> : null}
              <Form.Item name="note" label="Note"><Input.TextArea rows={2} /></Form.Item>
            </>
          ) : null}
        </Form>
      </Modal>
    </Drawer>
  );
}
