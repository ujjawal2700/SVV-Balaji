import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { riderApi, type DepositLedger, type DepositStatus, type DocItem, type DocState } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { Alert, Camera, Check, Chevron, Clock, Wallet, X } from '../ui/icons';
import { Field, Spinner, TextInput, TopBar, date, inr, useToast } from '../ui/kit';
import { loadRazorpayScript } from './account';

/**
 * Onboarding: the documents a rider must upload (the Police Clearance
 * Certificate among them) and the security deposit. A rider is only offered
 * orders once every mandatory item here is cleared - the server enforces it,
 * these screens show what is left and let the rider fix it.
 */

export const DOC_CHIP: Record<DocState, { cls: string; label: string }> = {
  NOT_UPLOADED: { cls: 'grey', label: 'Not uploaded' },
  PENDING: { cls: 'orange', label: 'Pending review' },
  APPROVED: { cls: 'green', label: 'Approved' },
  REJECTED: { cls: 'red', label: 'Rejected' },
  EXPIRED: { cls: 'red', label: 'Expired' },
};

export const DEPOSIT_CHIP: Record<DepositStatus, { cls: string; label: string }> = {
  NOT_REQUIRED: { cls: 'grey', label: 'Not required' },
  NOT_PAID: { cls: 'red', label: 'Not paid' },
  PARTIALLY_PAID: { cls: 'orange', label: 'Partly paid' },
  PAID: { cls: 'green', label: 'Paid' },
};

export const useVerification = () => useQuery({ queryKey: ['verification'], queryFn: riderApi.verification, refetchInterval: 30_000 });

function StateIcon({ ok, bad }: { ok: boolean; bad?: boolean }) {
  return (
    <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center', background: ok ? 'var(--green-soft)' : bad ? 'var(--red-soft)' : 'var(--orange-soft)', color: ok ? 'var(--green)' : bad ? 'var(--red)' : 'var(--orange)' }}>
      {ok ? <Check size={16} /> : bad ? <X size={16} /> : <Clock size={15} />}
    </span>
  );
}

function DocRow({ item }: { item: DocItem }) {
  const chip = DOC_CHIP[item.state];
  const bad = item.state === 'REJECTED' || item.state === 'EXPIRED';
  return (
    <Link to={`/verification/doc/${item.type.id}`} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, color: 'inherit' }}>
      <StateIcon ok={item.satisfied && item.state === 'APPROVED'} bad={bad || item.state === 'NOT_UPLOADED'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <b style={{ color: 'var(--ink)', fontSize: 15 }}>{item.type.name}</b>
          {!item.mandatory ? <span className="chip grey">Optional</span> : null}
        </div>
        <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <span className={`chip ${chip.cls}`}>{chip.label}</span>
          {item.satisfied && item.validUntil ? <span className="muted" style={{ fontSize: 12 }}>Valid till {date(item.validUntil)}</span> : null}
          {item.state !== 'APPROVED' && item.approvedInForce ? <span className="muted" style={{ fontSize: 12 }}>Earlier copy still valid</span> : null}
        </div>
        {item.state === 'REJECTED' && item.current?.rejectionReason ? (
          <div style={{ fontSize: 13, color: '#b3264a', marginTop: 6 }}>{item.current.rejectionReason}</div>
        ) : null}
      </div>
      <Chevron size={18} style={{ color: '#c4c4cc', flex: 'none' }} />
    </Link>
  );
}

/** Checklist hub: documents, PCC, deposit and the overall status. */
export function VerificationScreen() {
  const v = useVerification();
  const navigate = useNavigate();
  const data = v.data;
  const docs = data?.documents.filter((d) => d.type.code !== 'PCC') ?? [];
  return (
    <div className="app">
      <TopBar title="Verification" back="/" />
      <div className="page">
        {v.isLoading ? <Spinner /> : !data ? <div className="card empty">{errorMessage(v.error)}</div> : (
          <>
            <div className="card" style={{ background: data.eligible ? 'var(--green-soft)' : 'var(--orange-soft)', border: 'none' }}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: data.eligible ? 'var(--green)' : 'var(--orange-dark)', marginTop: 2 }}>{data.eligible ? <Check size={22} /> : <Alert size={22} />}</span>
                <div>
                  <b style={{ color: 'var(--ink)' }}>{data.eligible ? 'You are verified' : `${data.missing.length} ${data.missing.length === 1 ? 'step' : 'steps'} left before you can take orders`}</b>
                  {data.eligible ? (
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {data.status === 'ACTIVE' ? 'Go online from the dashboard to start getting orders.' : 'Our team will now approve you and assign your store.'}
                      {data.verifiedUntil ? ` Renew your documents before ${date(data.verifiedUntil)}.` : ''}
                    </div>
                  ) : (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
                      {data.missing.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="section-title">Documents</div>
            {docs.map((d) => <DocRow key={d.type.id} item={d} />)}

            {data.pcc ? (
              <>
                <div className="section-title">Police Clearance Certificate</div>
                <DocRow item={data.pcc} />
              </>
            ) : null}

            {data.deposit.required || data.deposit.paid > 0 ? (
              <>
                <div className="section-title">Security deposit</div>
                <button type="button" className="card" onClick={() => navigate('/deposit')} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer' }}>
                  <StateIcon ok={data.deposit.satisfied} bad={data.deposit.status === 'NOT_PAID'} />
                  <div style={{ flex: 1 }}>
                    <b style={{ color: 'var(--ink)', fontSize: 15 }}>{data.deposit.required ? `${inr(data.deposit.requiredAmount)} required` : 'Deposit on file'}</b>
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      <span className={`chip ${DEPOSIT_CHIP[data.deposit.status].cls}`}>{DEPOSIT_CHIP[data.deposit.status].label}</span>
                      <span className="muted" style={{ fontSize: 12 }}>Paid {inr(data.deposit.paid)}{data.deposit.pending > 0 ? ` · ${inr(data.deposit.pending)} pending` : ''}</span>
                    </div>
                  </div>
                  <Chevron size={18} style={{ color: '#c4c4cc' }} />
                </button>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

const isPdf = (url: string) => /\.pdf($|\?)/i.test(url);

function Pages({ urls, onRemove }: { urls: string[]; onRemove?: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {urls.map((u, i) => (
        <div key={u} style={{ position: 'relative', width: 92, height: 92, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', background: '#fafafa' }}>
          <a href={u} target="_blank" rel="noreferrer" style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: 'var(--ink)', fontWeight: 600, fontSize: 13 }}>
            {isPdf(u) ? 'PDF' : <img src={u} alt={`Page ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </a>
          {onRemove ? (
            <button type="button" aria-label="Remove page" onClick={() => onRemove(i)} style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', display: 'grid', placeItems: 'center' }}>
              <X size={14} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** One document: its status, why it was rejected, and the upload form when the rider may (re)upload. */
export function DocumentScreen() {
  const { typeId } = useParams<{ typeId: string }>();
  const v = useVerification();
  const qc = useQueryClient();
  const { reload } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ documentNumber: '', issuedBy: '', issuedOn: '', expiresOn: '' });

  const item = v.data?.documents.find((d) => d.type.id === typeId);
  if (v.isLoading) return <div className="app"><TopBar title="Document" back="/verification" /><div className="page"><Spinner /></div></div>;
  if (!item) return <div className="app"><TopBar title="Document" back="/verification" /><div className="page"><div className="card empty">This document is not required any more.</div></div></div>;

  const t = item.type;
  const pcc = t.code === 'PCC';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 4 - urls.length)) {
        const { url } = await riderApi.uploadVerificationFile(f);
        setUrls((u) => [...u, url]);
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
      if (file.current) file.current.value = '';
    }
  };

  const submit = async () => {
    if (!urls.length) return toast('Add a photo or PDF of the document', 'error');
    setSaving(true);
    try {
      await riderApi.submitDocument({
        typeId: t.id, fileUrls: urls,
        documentNumber: form.documentNumber.trim() || undefined, issuedBy: form.issuedBy.trim() || undefined,
        issuedOn: form.issuedOn || undefined, expiresOn: form.expiresOn || undefined,
      });
      toast(`${t.name} sent for review`, 'success');
      await qc.invalidateQueries({ queryKey: ['verification'] });
      void reload();
      navigate('/verification', { replace: true });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const chip = DOC_CHIP[item.state];
  const cur = item.current;
  return (
    <div className="app">
      <TopBar title={pcc ? 'Police Clearance' : t.name} back="/verification" />
      <div className="page">
        <div className="card">
          <div className="between">
            <b style={{ color: 'var(--ink)' }}>{t.name}</b>
            <span className={`chip ${chip.cls}`}>{chip.label}</span>
          </div>
          {t.description ? <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{t.description}</div> : null}
          {pcc ? <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Required before you can take any order. Get it from your local police station or the state police citizen portal.</div> : null}
          {item.state === 'REJECTED' && cur?.rejectionReason ? (
            <div className="form-error" style={{ marginTop: 12 }}><b>Why it was rejected:</b> {cur.rejectionReason}</div>
          ) : null}
          {item.state === 'PENDING' ? <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Uploaded {date(cur?.uploadedAt)} - our team will check it soon. You can replace it below if you sent the wrong file.</div> : null}
          {item.satisfied ? <div style={{ fontSize: 13, marginTop: 10, color: 'var(--green)' }}>Verified{item.validUntil ? `, valid till ${date(item.validUntil)}` : ''}.</div> : null}
          {cur ? (
            <div style={{ marginTop: 12 }}>
              <Pages urls={cur.fileUrls} />
              <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
                {[cur.documentNumber && `No. ${cur.documentNumber}`, cur.issuedBy && `Issued by ${cur.issuedBy}`, cur.issuedOn && `Issued ${date(cur.issuedOn)}`, cur.expiresOn && `Expires ${date(cur.expiresOn)}`].filter(Boolean).join(' · ')}
              </div>
            </div>
          ) : null}
        </div>

        {item.canUpload ? (
          <>
            <div className="section-title">{cur ? 'Upload again' : 'Upload'}</div>
            <div className="card">
              <Field label="Photos or PDF" required hint="Front and back if it has two sides. Up to 4 pages, clear and readable.">
                <div style={{ marginTop: 4 }}>
                  <Pages urls={urls} onRemove={(i) => setUrls((u) => u.filter((_, j) => j !== i))} />
                  {urls.length < 4 ? (
                    <button type="button" className="btn soft small" style={{ marginTop: urls.length ? 10 : 0 }} disabled={uploading} onClick={() => file.current?.click()}>
                      <Camera size={16} /> {uploading ? 'Uploading…' : urls.length ? 'Add page' : 'Add photo / PDF'}
                    </button>
                  ) : null}
                  <input ref={file} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void add(e.target.files)} />
                </div>
              </Field>
              {t.requiresNumber ? (
                <Field label={pcc ? 'Certificate number' : 'Document number'} required>
                  <TextInput value={form.documentNumber} onChange={set('documentNumber')} maxLength={60} autoCapitalize="characters" />
                </Field>
              ) : null}
              {t.requiresIssuer ? (
                <Field label={pcc ? 'Issued by (police station)' : 'Issued by'} required>
                  <TextInput value={form.issuedBy} onChange={set('issuedBy')} maxLength={120} placeholder={pcc ? 'e.g. TT Nagar Police Station, Bhopal' : undefined} />
                </Field>
              ) : null}
              {t.requiresIssueDate ? (
                <Field label="Issue date" required>
                  <TextInput type="date" value={form.issuedOn} onChange={set('issuedOn')} max={today} />
                </Field>
              ) : null}
              <Field label={t.requiresExpiry ? 'Valid till' : 'Valid till (if printed)'} required={t.requiresExpiry}>
                <TextInput type="date" value={form.expiresOn} onChange={set('expiresOn')} min={today} />
              </Field>
              <button className="btn primary block" style={{ marginTop: 8 }} disabled={saving || uploading} onClick={() => void submit()}>
                {saving ? 'Sending…' : 'Send for review'}
              </button>
            </div>
          </>
        ) : item.satisfied ? (
          <div className="muted" style={{ fontSize: 13, textAlign: 'center', marginTop: 14 }}>Need to change it? Ask your store manager.</div>
        ) : null}
      </div>
    </div>
  );
}

const ENTRY_LABEL: Record<DepositLedger['entries'][number]['type'], string> = {
  PAYMENT: 'Deposit paid', REFUND: 'Refunded to you', FORFEIT: 'Kept by company', ADJUSTMENT: 'Adjustment',
};

/** Security deposit: required / paid / pending / status, pay online, and the full ledger. */
export function DepositScreen() {
  const q = useQuery({ queryKey: ['deposit'], queryFn: riderApi.deposit });
  const qc = useQueryClient();
  const { rider, reload } = useAuth();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const dep = q.data;

  const done = async (paid: number) => {
    toast(`${inr(paid)} deposit received`, 'success');
    setAmount('');
    await Promise.all([qc.invalidateQueries({ queryKey: ['deposit'] }), qc.invalidateQueries({ queryKey: ['verification'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
    void reload();
  };

  const pay = async () => {
    if (!dep) return;
    const n = amount ? Number(amount) : dep.pending;
    if (!Number.isFinite(n) || n < 1) return toast('Enter a valid amount', 'error');
    if (n > dep.pending) return toast(`Only ${inr(dep.pending)} is pending`, 'error');
    setPaying(true);
    try {
      const order = await riderApi.depositOrder(n);
      const cfg = order.clientConfig || {};
      if (cfg.provider === 'mock') {
        await riderApi.depositVerify({ gatewayOrderId: order.gatewayOrderId, paymentId: `mockpay_${Date.now()}`, signature: 'mock_signature' });
        await done(order.amount);
        setPaying(false);
        return;
      }
      if (!(await loadRazorpayScript())) {
        toast('Could not load the payment page. Check your internet connection.', 'error');
        setPaying(false);
        return;
      }
      const rzp = new (window as any).Razorpay({
        key: cfg.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: cfg.amount,
        currency: cfg.currency || 'INR',
        name: 'SVV Balaji',
        description: `Rider security deposit (${inr(order.amount)})`,
        order_id: order.gatewayOrderId,
        prefill: { name: rider?.fullName, contact: rider?.phone, email: rider?.email ?? undefined },
        handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await riderApi.depositVerify({ gatewayOrderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
            await done(order.amount);
          } catch (e) {
            toast(errorMessage(e, 'Payment could not be confirmed - contact your store with the payment id'), 'error');
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (e) {
      toast(errorMessage(e), 'error');
      setPaying(false);
    }
  };

  return (
    <div className="app">
      <TopBar title="Security Deposit" back />
      <div className="page">
        {!dep ? <Spinner /> : (
          <>
            <div className="card" style={{ padding: '20px 16px' }}>
              <div className="between">
                <span className="muted" style={{ fontSize: 14 }}>Status</span>
                <span className={`chip ${DEPOSIT_CHIP[dep.status].cls}`}>{DEPOSIT_CHIP[dep.status].label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16, textAlign: 'center' }}>
                {[['Required', dep.requiredAmount], ['Paid', dep.paid], ['Pending', dep.pending]].map(([label, n]) => (
                  <div key={label as string} style={{ background: '#fafafa', borderRadius: 12, padding: '12px 4px' }}>
                    <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: 17, color: label === 'Pending' && (n as number) > 0 ? 'var(--orange-dark)' : 'var(--ink)', marginTop: 4 }}>{inr(n as number)}</div>
                  </div>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
                {dep.required
                  ? 'You can take orders once the full deposit is paid. It is refundable when you stop riding, less any losses recorded against it.'
                  : 'No deposit is required at the moment.'}
              </div>
              {dep.pending > 0 ? (
                <div style={{ marginTop: 16 }}>
                  <Field label="Amount to pay now" hint={`You can pay in parts. Pending: ${inr(dep.pending)}.`}>
                    <TextInput type="number" inputMode="decimal" min={1} max={dep.pending} placeholder={String(dep.pending)} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                  <button className="btn primary block" disabled={paying} onClick={() => void pay()}>
                    <Wallet size={18} /> {paying ? 'Opening payment…' : `Pay ${inr(amount ? Number(amount) || 0 : dep.pending)} online`}
                  </button>
                  <div className="muted" style={{ fontSize: 12, marginTop: 8, textAlign: 'center' }}>Paying in cash or by bank transfer? Pay at your store - they record it here.</div>
                </div>
              ) : null}
            </div>

            <div className="section-title">History</div>
            {dep.entries.length === 0 ? <div className="card empty">Nothing paid yet.</div> : (
              <div className="card" style={{ padding: '4px 14px' }}>
                {dep.entries.map((e) => (
                  <div key={e.id} className="between" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--ink)', fontSize: 14 }}>{ENTRY_LABEL[e.type]}{e.online ? ' · online' : e.method ? ` · ${e.method.replace(/_/g, ' ').toLowerCase()}` : ''}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{date(e.createdAt)}{e.reference ? ` · ${e.reference}` : ''}</div>
                      {e.note ? <div className="muted" style={{ fontSize: 12 }}>{e.note}</div> : null}
                    </div>
                    <b style={{ color: e.amount < 0 ? '#b3264a' : 'var(--green)', whiteSpace: 'nowrap' }}>{e.amount < 0 ? '−' : '+'}{inr(Math.abs(e.amount))}</b>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
