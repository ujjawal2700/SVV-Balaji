import { ArrowLeftOutlined, CarOutlined, RightOutlined, SafetyCertificateOutlined, WalletOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Modal, Skeleton, Switch, Tag, Timeline, Typography, message } from 'antd';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { checkoutError } from '../api/checkout';
import { RETURN_STATUS_COLOR, REFUND_METHOD_LABEL, returnsApi, type DifferencePayment, type ReturnDetail } from '../api/returns';
import { formatInr } from '../utils/money';

import { DesktopPageHeader } from '../layout/DesktopPageHeader';
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window'));
    document.body.appendChild(s);
  });
}

function Shell({ title, children, crumbs }: { title: string; children: React.ReactNode; crumbs?: Array<{ label: string; to?: string }> }) {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 90 }}>
      <header className="mobile-flex" style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}><ArrowLeftOutlined style={{ fontSize: 20 }} /></button>
        <Typography.Text strong style={{ fontSize: 16 }}>{title}</Typography.Text>
      </header>
      <DesktopPageHeader title={title} crumbs={crumbs ?? [{ label: 'My Account', to: '/profile' }, { label: title }]} />
      <div className="dk-container">
        <div className="dk-wide dk-readable" style={{ padding: 12, maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

/** Every return / exchange the signed-in customer or retailer has raised. */
export function ReturnsPage() {
  const q = useQuery({ queryKey: ['storefront', 'returns', 'list'], queryFn: returnsApi.list });
  const wallet = useQuery({ queryKey: ['storefront', 'wallet', 'refund'], queryFn: returnsApi.refundWallet });
  const [showLedger, setShowLedger] = useState(false);
  return (
    <Shell title="My returns & exchanges">
      <Card size="small" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}><WalletOutlined /> Refund Wallet</Typography.Text>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d' }}>{formatInr(wallet.data?.balance ?? 0)}</div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>Use it at checkout or towards an exchange</Typography.Text>
          </div>
          {wallet.data?.transactions.length ? <Button size="small" onClick={() => setShowLedger((v) => !v)}>{showLedger ? 'Hide' : 'History'}</Button> : null}
        </div>
        {showLedger ? wallet.data?.transactions.map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderTop: '1px solid #dcfce7', padding: '6px 0' }}>
            <span>{t.note ?? t.reason.replace(/_/g, ' ').toLowerCase()}<br /><span style={{ color: '#64748b' }}>{when(t.createdAt)}</span></span>
            <strong style={{ color: t.amount < 0 ? '#b91c1c' : '#15803d' }}>{t.amount < 0 ? '−' : '+'}{formatInr(Math.abs(t.amount))}</strong>
          </div>
        )) : null}
      </Card>
      {q.isLoading ? <Card><Skeleton active /></Card> : !q.data?.length ? (
        <Card><Empty description="No returns or exchanges yet. Start one from a delivered order." /></Card>
      ) : q.data.map((r) => (
        <Link key={r.requestNumber} to={`/returns/${r.requestNumber}`}>
          <Card size="small" hoverable>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {r.product.imageUrl ? <img src={r.product.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} /> : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography.Text strong ellipsis style={{ display: 'block' }}>{r.product.name} × {r.quantity}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.type === 'RETURN' ? 'Return' : 'Exchange'} {r.requestNumber} · order {r.orderNumber}</Typography.Text>
                <div><Tag color={RETURN_STATUS_COLOR[r.status]} style={{ marginTop: 4 }}>{r.statusLabel}</Tag></div>
              </div>
              <RightOutlined style={{ color: '#94a3b8' }} />
            </div>
          </Card>
        </Link>
      ))}
    </Shell>
  );
}

export function ReturnDetailPage() {
  const { requestNumber = '' } = useParams<{ requestNumber: string }>();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['storefront', 'returns', 'detail', requestNumber],
    queryFn: () => returnsApi.detail(requestNumber),
    refetchInterval: (x) => (x.state.data && ['COMPLETED', 'REJECTED', 'CANCELLED', 'QC_FAILED'].includes(x.state.data.status) ? false : 20_000),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['storefront', 'returns'] });

  if (q.isLoading) return <Shell title="Request"><Card><Skeleton active paragraph={{ rows: 8 }} /></Card></Shell>;
  if (q.error || !q.data) return <Shell title="Request"><Alert type="error" showIcon message={q.error ? checkoutError(q.error).message : 'Not found'} /></Shell>;
  const r = q.data;
  return (
    <Shell title={`${r.type === 'RETURN' ? 'Return' : 'Exchange'} ${r.requestNumber}`}>
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {r.product.imageUrl ? <img src={r.product.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} /> : null}
          <div style={{ flex: 1 }}>
            <Typography.Text strong style={{ display: 'block' }}>{r.product.name} × {r.quantity}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>Order <Link to={`/orders/${r.orderNumber}`}>{r.orderNumber}</Link> · {r.reason}</Typography.Text>
          </div>
          <Tag color={RETURN_STATUS_COLOR[r.status]}>{r.statusLabel}</Tag>
        </div>
        {r.rejectedReason ? <Alert style={{ marginTop: 10 }} type="error" showIcon message={`Rejected: ${r.rejectedReason}`} /> : null}
      </Card>

      {r.pickupOtp ? <CodeCard title="Pickup code" code={r.pickupOtp} hint="Give this code to the rider only when you hand over the item." /> : null}
      {r.replacementOtp ? <CodeCard title="Delivery code" code={r.replacementOtp} hint="Share it with the rider once you have checked your replacement." /> : null}
      {r.rider ? <Card size="small"><CarOutlined /> Rider: <strong>{r.rider.fullName}</strong> · <a href={`tel:${r.rider.phone}`}>{r.rider.phone}</a></Card> : null}
      {r.tracking.map((t) => (
        <Card key={`${t.direction}-${t.awb}`} size="small" title={t.direction === 'REVERSE' ? 'Pickup by courier' : 'Replacement shipment'}>
          {t.courier} · AWB <strong>{t.awb}</strong> · <Typography.Text type="secondary">{t.status.replace(/_/g, ' ').toLowerCase()}</Typography.Text>
          {t.trackingUrl ? <div><a href={t.trackingUrl} target="_blank" rel="noreferrer">Track</a></div> : null}
        </Card>
      ))}

      {r.exchange ? <ExchangeCard r={r} onChange={refresh} /> : (
        <Card title="Refund">
          <Row label="Paid for these items" value={formatInr(r.itemValue)} />
          {r.deductions.shippingFee > 0 ? <Row label="Return shipping" value={`− ${formatInr(r.deductions.shippingFee)}`} /> : null}
          {r.deductions.restockingFee > 0 ? <Row label="Restocking fee" value={`− ${formatInr(r.deductions.restockingFee)}`} /> : null}
          <Row label="Refund" value={formatInr(r.refund.amount)} bold />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {r.refund.method ? REFUND_METHOD_LABEL[r.refund.method] : ''}
            {r.refund.refundedAt ? ` · paid ${when(r.refund.refundedAt)}${r.refund.reference ? ` (ref ${r.refund.reference})` : ''}` : ''}
          </Typography.Text>
          {r.refund.refundedAt && (r.refund.coinsRestored.loyalty > 0 || r.refund.coinsRestored.referral > 0) ? (
            <div style={{ fontSize: 12, marginTop: 4 }}>Coins returned: {r.refund.coinsRestored.loyalty + r.refund.coinsRestored.referral}</div>
          ) : null}
        </Card>
      )}

      <Card title="Progress">
        <Timeline items={r.timeline.map((t) => ({ children: <span><strong>{t.label}</strong> <span style={{ color: '#64748b', fontSize: 12 }}>· {when(t.at)}{t.note ? ` · ${t.note}` : ''}</span></span> }))} />
      </Card>

      {r.mediaUrls.length ? (
        <Card title="Your photos / videos" size="small">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {r.mediaUrls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} /></a>)}
          </div>
        </Card>
      ) : null}

      {r.canCancel ? (
        <Button danger block onClick={() => Modal.confirm({
          title: 'Cancel this request?',
          content: 'You can raise a new one later while the window is open.',
          okText: 'Cancel request',
          onOk: async () => {
            try { await returnsApi.cancel(r.requestNumber); message.success('Request cancelled'); refresh(); } catch (e) { message.error(checkoutError(e).message); }
          },
        })}>Cancel request</Button>
      ) : null}
    </Shell>
  );
}

function ExchangeCard({ r, onChange }: { r: ReturnDetail; onChange: () => void }) {
  const x = r.exchange!;
  const [useWallet, setUseWallet] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mock, setMock] = useState<DifferencePayment | null>(null);
  const wallet = useQuery({ queryKey: ['storefront', 'wallet', 'refund'], queryFn: returnsApi.refundWallet, enabled: x.canPay });

  const confirm = async (body: { gatewayPaymentId: string; signature: string }) => {
    try {
      await returnsApi.confirmDifference(r.requestNumber, body);
      message.success('Payment received');
      onChange();
    } catch (e) {
      message.error(checkoutError(e).message);
    }
  };

  const pay = async () => {
    setBusy(true);
    try {
      const p = await returnsApi.payDifference(r.requestNumber, useWallet);
      if (p.paid) {
        message.success('Paid from your Refund Wallet');
        onChange();
      } else if (p.gateway?.provider === 'razorpay') {
        await loadRazorpay();
        new window.Razorpay!({
          key: p.gateway.keyId, order_id: p.gateway.gatewayOrderId, amount: p.gateway.amount, currency: p.gateway.currency, name: 'SVV Balaji',
          handler: (resp: { razorpay_payment_id: string; razorpay_signature: string }) => void confirm({ gatewayPaymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }),
        }).open();
      } else {
        setMock(p);
      }
    } catch (e) {
      message.error(checkoutError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Exchange">
      <Row label="Replacement" value={x.replacement?.name ?? '-'} />
      <Row label="You paid for the original" value={formatInr(r.itemValue)} />
      {x.priceDifference !== 0 ? (
        <Row label={x.priceDifference > 0 ? 'Price difference to pay' : 'Price difference back to you'} value={formatInr(Math.abs(x.priceDifference))} bold />
      ) : <Row label="Price difference" value="None" />}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {x.differenceStatus === 'PAID' ? 'Difference paid' : x.differenceStatus === 'CREDITED' ? 'Credited to your Refund Wallet' : x.differenceStatus === 'WAIVED' ? 'Waived' : ''}
      </Typography.Text>
      {x.canPay ? (
        <div style={{ marginTop: 12 }}>
          {(wallet.data?.balance ?? 0) > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span><WalletOutlined /> Use Refund Wallet ({formatInr(wallet.data!.balance)})</span>
              <Switch checked={useWallet} onChange={setUseWallet} />
            </div>
          ) : null}
          <Button type="primary" block loading={busy} onClick={() => void pay()} style={{ background: '#f97316', borderColor: '#f97316' }}>
            Pay {formatInr(x.amountDue)}
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>The replacement is sent once the difference is paid.</Typography.Text>
        </div>
      ) : null}
      <Modal open={mock !== null} title="Test payment (development gateway)" footer={null} onCancel={() => setMock(null)}>
        <Typography.Paragraph>Amount: <strong>{mock ? formatInr(mock.amountDue) : ''}</strong></Typography.Paragraph>
        <Button type="primary" block onClick={() => { setMock(null); void confirm({ gatewayPaymentId: `mockpay_${Date.now()}`, signature: 'mock_signature' }); }}>Simulate success</Button>
      </Modal>
    </Card>
  );
}

function CodeCard({ title, code, hint }: { title: string; code: string; hint: string }) {
  return (
    <Card>
      <div style={{ textAlign: 'center' }}>
        <Typography.Text type="secondary"><SafetyCertificateOutlined /> {title}</Typography.Text>
        <div style={{ fontSize: 32, letterSpacing: 10, fontWeight: 800, color: '#c2410c', margin: '4px 0' }}>{code}</div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{hint}</Typography.Text>
      </div>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
