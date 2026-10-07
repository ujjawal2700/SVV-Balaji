import {
  ArrowLeftOutlined, CheckCircleFilled, ClockCircleFilled, CloseCircleFilled, CopyOutlined, LinkOutlined, ShareAltOutlined, StopFilled, WalletOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, App as AntApp, Button, Checkbox, Empty, Form, Input, Modal, Pagination, Radio, Select, Skeleton, Tag, Typography,
} from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { apiErrorMessage } from '../api/client';
import {
  affiliateApi, COMMISSION_STATUS_COLOR, COMMISSION_STATUS_LABEL, type AffiliateMe, type AffiliateProfile, type ApplyBody, type CommissionRow,
  type PayoutDetails,
} from '../api/affiliate';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { buildAffiliateLink } from '../utils/affiliateLink';
import { formatInr } from '../utils/money';

const card = { background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' } as const;
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const QUERY_KEY = ['storefront', 'affiliate', 'me'];

/**
 * Desi Tokri Affiliate Program: apply, then share links and earn a commission
 * on every item bought through them (the rate depends on the category).
 * Everything shown is from GET /storefront/affiliate/me.
 */
export function AffiliatePage() {
  const navigate = useNavigate();
  const { role, initialising } = useCustomerAuth();
  const me = useQuery({ queryKey: QUERY_KEY, queryFn: affiliateApi.me, enabled: role !== 'GUEST' });

  if (initialising) return null;
  // Signed out: the public landing page explains the program and leads back here after sign-in.
  if (role === 'GUEST') return <Navigate to="/affiliate-program" replace />;

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', paddingBottom: 40 }}>
      <header style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} aria-label="Back" />
        <Typography.Title level={5} style={{ margin: 0 }}>Affiliate Program</Typography.Title>
      </header>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {me.isLoading ? (
          <div style={{ ...card, padding: 20 }}><Skeleton active paragraph={{ rows: 5 }} /></div>
        ) : me.error || !me.data ? (
          <Alert type="error" showIcon message="Could not load the affiliate program. Please try again shortly." />
        ) : (
          <Body data={me.data} />
        )}
      </div>
    </div>
  );
}

function Body({ data }: { data: AffiliateMe }) {
  const a = data.affiliate;
  if (!a) {
    if (!data.program.enabled) return <Alert type="info" showIcon message="The affiliate program is not accepting applications right now." />;
    return (
      <>
        <Intro holdDays={data.program.holdDays} cookieDays={data.program.cookieDays} />
        <Link to="/affiliate-program" style={{ fontSize: 13 }}>See commission rates and FAQs</Link>
        <ApplyForm terms={data.program.termsText} />
      </>
    );
  }
  if (a.status === 'PENDING') {
    return (
      <StatusCard icon={<ClockCircleFilled style={{ color: '#d97706' }} />} title="Application under review">
        We received your application on {day(a.appliedAt)}. You will be able to share links and earn as soon as it is approved.
        Your affiliate code will be <b>{a.code}</b>.
      </StatusCard>
    );
  }
  if (a.status === 'REJECTED') {
    return (
      <>
        <StatusCard icon={<CloseCircleFilled style={{ color: '#dc2626' }} />} title="Application not approved">
          {a.rejectionReason ? <>Reason: {a.rejectionReason}. </> : null}You can update your details and apply again.
        </StatusCard>
        <ApplyForm terms={data.program.termsText} previous={a} />
      </>
    );
  }
  return <Dashboard data={data} affiliate={a} />;
}

function Intro({ holdDays, cookieDays }: { holdDays: number; cookieDays: number }) {
  const points = [
    'Share a link to any Desi Tokri page - a product, a category or the home page.',
    `Anyone who buys within ${cookieDays} days of clicking it counts as yours (the latest link they clicked wins).`,
    'You earn a percentage of every item they buy. Rates differ by category: staples earn less, masalas and snacks more.',
    `Commission is confirmed ${holdDays} days after the order (our return window) and paid out monthly to your UPI or bank account.`,
  ];
  return (
    <div style={{ ...card, padding: 20, background: 'linear-gradient(135deg,#fff7ed,#fff)' }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>Earn by sharing Desi Tokri</Typography.Title>
      <ul style={{ paddingLeft: 18, margin: 0, color: '#44403c', lineHeight: 1.7 }}>
        {points.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
        Purchases you make yourself, or by anyone sharing your phone, email or payment account, do not earn commission.
      </Typography.Paragraph>
    </div>
  );
}

function StatusCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div style={{ ...card, padding: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 26, lineHeight: 1 }}>{icon}</div>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>{title}</Typography.Title>
        <Typography.Text style={{ color: '#57534e' }}>{children}</Typography.Text>
      </div>
    </div>
  );
}

function PayoutFields({ method }: { method: 'UPI' | 'BANK' }) {
  return method === 'UPI' ? (
    <Form.Item name="payoutUpiId" label="UPI id for payouts" rules={[{ required: true, message: 'Enter your UPI id' }]}>
      <Input placeholder="name@okaxis" autoComplete="off" />
    </Form.Item>
  ) : (
    <>
      <Form.Item name="payoutAccountName" label="Account holder name" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="payoutAccountNumber" label="Account number" rules={[{ required: true }, { pattern: /^\d{9,18}$/, message: '9-18 digits' }]}>
        <Input inputMode="numeric" autoComplete="off" />
      </Form.Item>
      <Form.Item name="payoutIfsc" label="IFSC" normalize={(v: string) => v?.toUpperCase()} rules={[{ required: true }, { pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/, message: 'e.g. HDFC0001234' }]}>
        <Input />
      </Form.Item>
      <Form.Item name="payoutBankName" label="Bank name"><Input /></Form.Item>
    </>
  );
}

function ApplyForm({ terms, previous }: { terms: string | null; previous?: AffiliateProfile }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<ApplyBody>();
  const [saving, setSaving] = useState(false);
  const method = Form.useWatch('payoutMethod', form) ?? 'UPI';

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const res = await affiliateApi.apply({ ...v, pan: v.pan?.toUpperCase() || undefined, email: v.email || undefined });
      qc.setQueryData(QUERY_KEY, res);
      message.success('Application sent - we will review it shortly');
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not send your application'), 6);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...card, padding: 20 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>{previous ? 'Apply again' : 'Apply to become an affiliate'}</Typography.Title>
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{
          payoutMethod: previous?.payoutMethod ?? 'UPI', fullName: previous?.fullName, email: previous?.email ?? undefined,
          promotionUrl: previous?.promotionUrl ?? undefined, payoutUpiId: previous?.payoutUpiId ?? undefined,
        }}
      >
        <Form.Item name="fullName" label="Full name" rules={[{ required: true, min: 2 }]}><Input autoComplete="name" /></Form.Item>
        <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}><Input autoComplete="email" /></Form.Item>
        <Form.Item name="promotionUrl" label="Where will you share? (website, Instagram, YouTube, WhatsApp group...)">
          <Input placeholder="https://instagram.com/yourhandle" />
        </Form.Item>
        <Form.Item name="audienceSize" label="Audience size">
          <Select allowClear options={['Under 1k', '1k-10k', '10k-50k', '50k-1L', 'Over 1L'].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item name="promotionPlan" label="How will you promote Desi Tokri?"><Input.TextArea rows={3} maxLength={1000} showCount /></Form.Item>
        <Form.Item name="pan" label="PAN (optional, needed for TDS above the threshold)" normalize={(v: string) => v?.toUpperCase()}
          rules={[{ pattern: /^[A-Z]{5}\d{4}[A-Z]$/, message: 'e.g. ABCDE1234F' }]}>
          <Input maxLength={10} />
        </Form.Item>
        <Form.Item name="payoutMethod" label="Get paid by">
          <Radio.Group optionType="button" options={[{ value: 'UPI', label: 'UPI' }, { value: 'BANK', label: 'Bank transfer' }]} />
        </Form.Item>
        <PayoutFields method={method} />
        {terms ? (
          <div style={{ background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8, padding: 12, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12, marginBottom: 12 }}>
            {terms}
          </div>
        ) : null}
        <Form.Item name="acceptTerms" valuePropName="checked" rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Please accept the terms'))) }]}>
          <Checkbox>I accept the affiliate program terms</Checkbox>
        </Form.Item>
        <Button type="primary" block size="large" loading={saving} onClick={submit}>Submit application</Button>
      </Form>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...card, padding: 14, flex: '1 1 140px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#78716c' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1c1917', marginTop: 2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: '#a8a29e' }}>{sub}</div> : null}
    </div>
  );
}

function Dashboard({ data, affiliate }: { data: AffiliateMe; affiliate: AffiliateProfile }) {
  const d = data.dashboard!;
  const active = affiliate.status === 'APPROVED';
  const [editing, setEditing] = useState(false);
  const b = d.balances;
  return (
    <>
      {active ? (
        <div style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircleFilled style={{ color: '#16a34a', fontSize: 20 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>You are an approved affiliate</div>
            <div style={{ fontSize: 12, color: '#78716c' }}>Your code: <b>{affiliate.code}</b></div>
          </div>
        </div>
      ) : (
        <Alert type="warning" showIcon icon={<StopFilled />} message="Your affiliate account is suspended"
          description={`${affiliate.suspendedReason ?? ''} Your links are not tracking new visits. Commission you already earned is still paid.`} />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Stat label="Clicks" value={d.clicks.toLocaleString('en-IN')} sub={`${d.clicksLast30Days} in the last 30 days`} />
        <Stat label="Successful orders" value={d.successfulOrders.toLocaleString('en-IN')} sub={`${d.conversionRatePercent}% of clicks`} />
        <Stat label="Total earnings" value={formatInr(d.totalEarnings)} sub="after returns" />
      </div>

      <div style={{ ...card, padding: 16 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}><WalletOutlined /> Your balance</Typography.Title>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <Balance label={`On hold (${d.holdDays}-day return window)`} value={b.pending} color="#d97706" />
          <Balance label="Ready for payout" value={b.payable} color="#2563eb" />
          <Balance label="Paid to you" value={b.paid} color="#16a34a" />
          <Balance label="Taken back for returns" value={b.reversed} color="#78716c" />
        </div>
        {b.clawbackDue > 0 ? (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            {formatInr(b.clawbackDue)} for items returned after they were paid will be deducted from your next payout.
          </Typography.Paragraph>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Paid to: {affiliate.payoutMethod === 'UPI' ? affiliate.payoutUpiId : `${affiliate.payoutBankName ?? 'Bank'} ${affiliate.payoutAccountNumber ?? ''}`}
          </Typography.Text>
          <Button size="small" onClick={() => setEditing(true)}>Change payout details</Button>
        </div>
      </div>

      {active ? <LinkGenerator code={affiliate.code} /> : null}
      <Commissions />
      <Payouts />
      <PayoutDetailsModal open={editing} onClose={() => setEditing(false)} affiliate={affiliate} />
    </>
  );
}

function Balance({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fafaf9', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: '#78716c' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{formatInr(value)}</div>
    </div>
  );
}

function LinkGenerator({ code }: { code: string }) {
  const { message } = AntApp.useApp();
  const [target, setTarget] = useState('');
  const link = useMemo(() => buildAffiliateLink(target, code), [target, code]);
  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => message.success('Link copied')).catch(() => message.info(text));
  const share = (text: string) => {
    if (navigator.share) void navigator.share({ title: 'Desi Tokri', text: 'Fresh, traceable masalas & staples from Desi Tokri', url: text }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <div style={{ ...card, padding: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}><LinkOutlined /> Link generator</Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        Open any product or category on Desi Tokri, copy its address and paste it here - or leave it empty to share the home page.
      </Typography.Paragraph>
      <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`${window.location.origin}/product-detail/...`} allowClear />
      {link ? (
        <div style={{ marginTop: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 12 }}>
          <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 13 }}>{link}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button type="primary" icon={<CopyOutlined />} onClick={() => copy(link)}>Copy</Button>
            <Button icon={<ShareAltOutlined />} onClick={() => share(link)}>Share</Button>
          </div>
        </div>
      ) : (
        <Alert style={{ marginTop: 12 }} type="warning" showIcon message="Paste a link to a Desi Tokri page" />
      )}
    </div>
  );
}

function Commissions() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['storefront', 'affiliate', 'commissions', page], queryFn: () => affiliateApi.commissions(page, 10) });
  return (
    <div style={{ ...card, padding: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>Commission by item</Typography.Title>
      {q.isLoading ? <Skeleton active /> : !q.data?.data.length ? (
        <Empty description="No commission yet - share your link to get started" />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.data.data.map((c) => <CommissionItem key={c.id} c={c} />)}
          </div>
          {q.data.total > q.data.pageSize ? (
            <Pagination style={{ marginTop: 12, textAlign: 'center' }} size="small" current={page} pageSize={q.data.pageSize} total={q.data.total} onChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}

function CommissionItem({ c }: { c: CommissionRow }) {
  return (
    <div style={{ border: '1px solid #f1f5f9', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.productName} × {c.quantity}</div>
          <div style={{ fontSize: 12, color: '#78716c' }}>{c.orderNumber} · {day(c.orderDate)}{c.categoryName ? ` · ${c.categoryName}` : ''}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 700 }}>{formatInr(c.netAmount)}</div>
          <Tag color={COMMISSION_STATUS_COLOR[c.status]} style={{ marginInlineEnd: 0 }}>{COMMISSION_STATUS_LABEL[c.status]}</Tag>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#a8a29e', marginTop: 4 }}>
        {c.ratePercent}% of {formatInr(c.baseAmount)}
        {c.refundedQuantity > 0 ? ` · ${c.refundedQuantity} returned (−${formatInr(c.refundedAmount)})` : ''}
        {c.status === 'PENDING' ? ` · confirms after ${day(c.releaseDate)} once delivered` : ''}
        {c.payoutNumber ? ` · ${c.payoutNumber}` : ''}
      </div>
    </div>
  );
}

function Payouts() {
  const q = useQuery({ queryKey: ['storefront', 'affiliate', 'payouts'], queryFn: affiliateApi.payouts });
  if (!q.data?.length) return null;
  return (
    <div style={{ ...card, padding: 16 }}>
      <Typography.Title level={5} style={{ marginTop: 0 }}>Payouts</Typography.Title>
      {q.data.map((p) => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{p.payoutNumber}</div>
            <div style={{ fontSize: 12, color: '#78716c' }}>{day(p.paidAt)} · {p.paidTo} · Ref {p.reference}</div>
          </div>
          <div style={{ fontWeight: 700, color: '#16a34a' }}>{formatInr(p.netAmount)}</div>
        </div>
      ))}
    </div>
  );
}

function PayoutDetailsModal({ open, onClose, affiliate }: { open: boolean; onClose: () => void; affiliate: AffiliateProfile }) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<PayoutDetails>();
  const [saving, setSaving] = useState(false);
  const method = Form.useWatch('payoutMethod', form) ?? affiliate.payoutMethod;
  const save = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      qc.setQueryData(QUERY_KEY, await affiliateApi.update(v));
      message.success('Payout details saved');
      onClose();
    } catch (e) {
      message.error(apiErrorMessage(e, 'Could not save'), 6);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} title="Payout details" onCancel={onClose} onOk={save} okText="Save" confirmLoading={saving} destroyOnClose>
      <Form form={form} layout="vertical" preserve={false} initialValues={{ payoutMethod: affiliate.payoutMethod, payoutUpiId: affiliate.payoutUpiId ?? undefined }}>
        <Form.Item name="payoutMethod" label="Get paid by">
          <Radio.Group optionType="button" options={[{ value: 'UPI', label: 'UPI' }, { value: 'BANK', label: 'Bank transfer' }]} />
        </Form.Item>
        <PayoutFields method={method} />
      </Form>
    </Modal>
  );
}
