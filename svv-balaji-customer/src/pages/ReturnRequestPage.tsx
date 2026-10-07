import { ArrowLeftOutlined, CameraOutlined, LoadingOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, InputNumber, Radio, Select, Skeleton, Space, Tag, Typography, Upload, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { checkoutError } from '../api/checkout';
import { REFUND_METHOD_LABEL, returnsApi, type RefundMethod, type ReturnType } from '../api/returns';
import { formatInr } from '../utils/money';

import { DesktopPageHeader } from '../layout/DesktopPageHeader';
const newKey = () => `ret-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Raise a return or exchange for ONE item of a delivered order: quantity,
 * reason, description, photos/videos, and either the replacement (exchange) or
 * how the refund should be paid (return). Amounts shown here are estimates; the
 * server computes the real figures from what was actually paid.
 */
export function ReturnRequestPage() {
  const { orderId: orderNumber = '' } = useParams<{ orderId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const idemKey = useRef(newKey());

  const el = useQuery({ queryKey: ['storefront', 'returns', 'eligibility', orderNumber], queryFn: () => returnsApi.eligibility(orderNumber), retry: false });
  const [itemId, setItemId] = useState<string | null>(params.get('item'));
  const [type, setType] = useState<ReturnType>('RETURN');
  const [qty, setQty] = useState(1);
  const [reasonId, setReasonId] = useState<string>();
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<Array<{ url: string; mimeType: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [replacementId, setReplacementId] = useState<string>();
  const [method, setMethod] = useState<RefundMethod>();
  const [upiId, setUpiId] = useState('');
  const [bank, setBank] = useState({ accountName: '', accountNumber: '', ifsc: '', bankName: '' });
  const [submitting, setSubmitting] = useState(false);

  const e = el.data;
  const item = e?.items.find((i) => i.orderItemId === itemId) ?? e?.items.find((i) => i.return.eligible || i.exchange.eligible);
  useEffect(() => {
    if (item && item.orderItemId !== itemId) setItemId(item.orderItemId);
  }, [item, itemId]);
  useEffect(() => {
    if (item && !item[type === 'RETURN' ? 'return' : 'exchange'].eligible) setType(item.return.eligible ? 'RETURN' : 'EXCHANGE');
  }, [item, type]);
  useEffect(() => {
    if (e && !method) setMethod(e.policy.defaultRefundMethod);
  }, [e, method]);

  const options = useQuery({
    queryKey: ['storefront', 'returns', 'replacements', orderNumber, item?.orderItemId],
    queryFn: () => returnsApi.replacements(orderNumber, item!.orderItemId),
    enabled: Boolean(item) && type === 'EXCHANGE',
  });
  useEffect(() => {
    if (type === 'EXCHANGE' && options.data && !replacementId) setReplacementId(options.data.find((o) => o.sameProduct)?.productId ?? options.data[0]?.productId);
  }, [type, options.data, replacementId]);

  const reasons = useMemo(() => (e?.reasons ?? []).filter((r) => (type === 'RETURN' ? r.forReturn : r.forExchange)), [e, type]);
  const reason = reasons.find((r) => r.id === reasonId);
  const needMedia = Boolean(e && (e.policy.mediaRequired || reason?.requiresMedia));
  const minMedia = needMedia ? Math.max(1, e!.policy.minMediaCount) : 0;

  if (el.isLoading) return <Shell onBack={() => navigate(-1)}><Card><Skeleton active paragraph={{ rows: 8 }} /></Card></Shell>;
  if (el.error || !e) return <Shell onBack={() => navigate(-1)}><Alert type="error" showIcon message={el.error ? checkoutError(el.error).message : 'Order not found'} /></Shell>;
  if (!item) return <Shell onBack={() => navigate(-1)}><Alert type="info" showIcon message="No item on this order can be returned or exchanged right now." /></Shell>;

  const check = type === 'RETURN' ? item.return : item.exchange;
  const value = item.unitPaid * qty;
  const fault = reason?.companyFault ?? false;
  const fees = type === 'RETURN' && !fault ? Math.min(value, e.policy.returnShippingFee + (value * e.policy.restockingFeePercent) / 100) : 0;
  const replacement = options.data?.find((o) => o.productId === replacementId);
  const diff = type === 'EXCHANGE' && replacement && !replacement.sameProduct ? replacement.unitPrice * qty - value : 0;

  const upload = async (file: File) => {
    if (media.length >= e.policy.maxMediaCount) {
      message.warning(`At most ${e.policy.maxMediaCount} photos/videos`);
      return;
    }
    setUploading(true);
    try {
      const m = await returnsApi.uploadMedia(file);
      setMedia((prev) => [...prev, m]);
    } catch (err) {
      message.error(checkoutError(err).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!reasonId) return void message.warning('Choose a reason');
    if (media.length < minMedia) return void message.warning(`Add at least ${minMedia} photo/video of the product`);
    if (type === 'EXCHANGE' && !replacementId) return void message.warning('Choose the replacement');
    if (type === 'RETURN' && method === 'UPI' && !upiId.trim()) return void message.warning('Enter your UPI id');
    if (type === 'RETURN' && method === 'BANK' && (!bank.accountName || !bank.accountNumber || !bank.ifsc)) return void message.warning('Enter your bank details');
    setSubmitting(true);
    try {
      const created = await returnsApi.create(
        {
          orderNumber, orderItemId: item.orderItemId, type, quantity: qty, reasonId, description: description.trim() || undefined,
          mediaUrls: media.map((m) => m.url),
          ...(type === 'EXCHANGE' ? { replacementProductId: replacementId } : {}),
          refundMethod: method,
          ...(type === 'RETURN' && method === 'UPI' ? { upiId: upiId.trim() } : {}),
          ...(type === 'RETURN' && method === 'BANK' ? { ...bank, ifsc: bank.ifsc.toUpperCase() } : {}),
        },
        idemKey.current,
      );
      void qc.invalidateQueries({ queryKey: ['storefront', 'returns'] });
      message.success(`${type === 'RETURN' ? 'Return' : 'Exchange'} requested`);
      navigate(`/returns/${created.requestNumber}`, { replace: true });
    } catch (err) {
      const x = checkoutError(err);
      message.error(x.message, 6);
      if (x.code === 'DUPLICATE_REQUEST' || x.code === 'QUANTITY_EXCEEDED') void el.refetch();
      idemKey.current = newKey();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell onBack={() => navigate(-1)}>
      <Card title="Item">
        <Select
          style={{ width: '100%' }}
          value={item.orderItemId}
          onChange={(v) => { setItemId(v); setQty(1); setReplacementId(undefined); }}
          options={e.items.map((i) => ({ value: i.orderItemId, label: `${i.name} (${i.remainingQuantity} of ${i.quantity} eligible)`, disabled: !(i.return.eligible || i.exchange.eligible) }))}
        />
      </Card>

      <Card title="What would you like to do?">
        <Radio.Group value={type} onChange={(ev) => { setType(ev.target.value); setReasonId(undefined); }} style={{ width: '100%' }}>
          <Space direction="vertical">
            <Radio value="RETURN" disabled={!item.return.eligible}>Return for a refund {!item.return.eligible ? <Tag>{item.return.reason}</Tag> : null}</Radio>
            <Radio value="EXCHANGE" disabled={!item.exchange.eligible}>Exchange for a replacement {!item.exchange.eligible ? <Tag>{item.exchange.reason}</Tag> : null}</Radio>
          </Space>
        </Radio.Group>
        {check.closesAt ? <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Available until {new Date(check.closesAt).toLocaleString('en-IN')}</Typography.Text> : null}
      </Card>

      <Card title="Details">
        <Typography.Text style={{ display: 'block', marginBottom: 4 }}>Quantity</Typography.Text>
        <InputNumber min={1} max={item.remainingQuantity} value={qty} onChange={(v) => setQty(Math.max(1, Math.min(item.remainingQuantity, Number(v) || 1)))} />
        <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>of {item.remainingQuantity} eligible</Typography.Text>

        <Typography.Text style={{ display: 'block', margin: '14px 0 4px' }}>Reason</Typography.Text>
        <Select style={{ width: '100%' }} placeholder="Choose a reason" value={reasonId} onChange={setReasonId} options={reasons.map((r) => ({ value: r.id, label: r.label }))} />

        <Typography.Text style={{ display: 'block', margin: '14px 0 4px' }}>Describe the issue (optional)</Typography.Text>
        <Input.TextArea rows={3} maxLength={1000} value={description} onChange={(ev) => setDescription(ev.target.value)} />

        <Typography.Text style={{ display: 'block', margin: '14px 0 4px' }}>
          Photos / videos {needMedia ? <Tag color="orange">required</Tag> : <Typography.Text type="secondary">(optional)</Typography.Text>}
        </Typography.Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {media.map((m) => (
            <div key={m.url} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {m.mimeType.startsWith('video/') ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              <button onClick={() => setMedia((p) => p.filter((x) => x.url !== m.url))} style={{ position: 'absolute', top: 2, right: 2, border: 'none', borderRadius: 10, background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          ))}
          {media.length < e.policy.maxMediaCount ? (
            <Upload accept="image/*,video/mp4,video/quicktime" showUploadList={false} beforeUpload={(f) => { void upload(f); return false; }}>
              <div style={{ width: 72, height: 72, borderRadius: 8, border: '1px dashed #94a3b8', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#64748b' }}>
                {uploading ? <LoadingOutlined /> : <CameraOutlined style={{ fontSize: 20 }} />}
              </div>
            </Upload>
          ) : null}
        </div>
      </Card>

      {type === 'EXCHANGE' ? (
        <Card title="Replacement">
          {options.isLoading ? <Skeleton active /> : (
            <Radio.Group value={replacementId} onChange={(ev) => setReplacementId(ev.target.value)} style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {(options.data ?? []).map((o) => (
                  <Radio key={o.productId} value={o.productId} disabled={o.available < qty}>
                    <span>{o.name}{o.packLabel ? ` · ${o.packLabel}` : ''} {o.sameProduct ? <Tag color="green">same product</Tag> : <Typography.Text type="secondary">{formatInr(o.unitPrice)} each</Typography.Text>}</span>
                    {o.available < qty ? <Tag color="red" style={{ marginLeft: 6 }}>out of stock</Tag> : null}
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          )}
          {options.data && options.data.every((o) => o.available < qty) ? (
            <Alert style={{ marginTop: 10 }} type="warning" showIcon message="Replacements are out of stock right now. You can request a return instead." />
          ) : null}
          {diff > 0.009 ? <Alert style={{ marginTop: 10 }} type="info" showIcon message={`About ${formatInr(diff)} to pay once the exchange is approved (Refund Wallet or online).`} /> : null}
          {diff < -0.009 ? <Alert style={{ marginTop: 10 }} type="success" showIcon message={`The replacement costs less - about ${formatInr(-diff)} comes back to you once it is delivered.`} /> : null}
        </Card>
      ) : (
        <Card title="Refund to">
          <Radio.Group value={method} onChange={(ev) => setMethod(ev.target.value)}>
            <Space direction="vertical">
              {e.policy.refundMethods.map((m) => <Radio key={m} value={m}>{REFUND_METHOD_LABEL[m]}</Radio>)}
            </Space>
          </Radio.Group>
          {method === 'UPI' ? <Input style={{ marginTop: 10 }} placeholder="UPI id, e.g. name@okbank" value={upiId} onChange={(ev) => setUpiId(ev.target.value)} /> : null}
          {method === 'BANK' ? (
            <Space direction="vertical" style={{ width: '100%', marginTop: 10 }}>
              <Input placeholder="Account holder name" value={bank.accountName} onChange={(ev) => setBank({ ...bank, accountName: ev.target.value })} />
              <Input placeholder="Account number" value={bank.accountNumber} onChange={(ev) => setBank({ ...bank, accountNumber: ev.target.value.replace(/\D/g, '') })} />
              <Input placeholder="IFSC" value={bank.ifsc} onChange={(ev) => setBank({ ...bank, ifsc: ev.target.value.toUpperCase() })} />
              <Input placeholder="Bank name (optional)" value={bank.bankName} onChange={(ev) => setBank({ ...bank, bankName: ev.target.value })} />
            </Space>
          ) : null}
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <div>Paid for {qty} item{qty > 1 ? 's' : ''}: <strong>{formatInr(value)}</strong></div>
            {fees > 0 ? <div style={{ color: '#b45309' }}>Return shipping / restocking: − {formatInr(fees)}</div> : null}
            <div>Estimated refund: <strong>{formatInr(Math.max(0, value - fees))}</strong> <Typography.Text type="secondary" style={{ fontSize: 12 }}>(after a quality check)</Typography.Text></div>
          </div>
        </Card>
      )}

      <Button type="primary" block size="large" loading={submitting} disabled={!check.eligible} onClick={() => void submit()}
        style={{ background: '#f97316', borderColor: '#f97316', borderRadius: 12, height: 48, fontWeight: 700 }}>
        Request {type === 'RETURN' ? 'return' : 'exchange'}
      </Button>
    </Shell>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 90 }}>
      <header className="mobile-flex" style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}><ArrowLeftOutlined style={{ fontSize: 20 }} /></button>
        <Typography.Text strong style={{ fontSize: 16 }}>Return or exchange</Typography.Text>
      </header>
      <DesktopPageHeader
        title="Return or exchange"
        subtitle="Choose the item, tell us what went wrong, and pick how you want your refund."
        crumbs={[{ label: 'My Orders', to: '/orders' }, { label: 'Return or exchange' }]}
      />
      <div className="dk-container">
        <div className="dk-wide dk-form" style={{ padding: 12, maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}
