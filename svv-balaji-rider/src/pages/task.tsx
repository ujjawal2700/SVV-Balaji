import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { errorCode, errorMessage } from '../api/client';
import { riderApi, type FailureReason, type TaskDetail } from '../api/rider';
import { currentPosition } from '../live/geo';
import { Alert, Camera, Cash, Check, Navigate as NavIcon, Phone, Pin, Store } from '../ui/icons';
import { Field, Modal, OtpInput, Spinner, TextInput, TopBar, inr, time, useToast } from '../ui/kit';
import { MiniMap, type MapPoint } from '../ui/MiniMap';
import { STATUS_LABEL } from '../ui/orders';

const FLOW: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'assigned', label: 'Accepted', statuses: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP', 'DELIVERED'] },
  { key: 'store', label: 'At the store', statuses: ['AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP', 'DELIVERED'] },
  { key: 'picked', label: 'Picked up', statuses: ['PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP', 'DELIVERED'] },
  { key: 'out', label: 'Out for delivery', statuses: ['OUT_FOR_DELIVERY', 'AT_DROP', 'DELIVERED'] },
  { key: 'drop', label: 'At the customer', statuses: ['AT_DROP', 'DELIVERED'] },
  { key: 'done', label: 'Delivered', statuses: ['DELIVERED'] },
];

function useTask(id: string) {
  return useQuery({ queryKey: ['task', id], queryFn: () => riderApi.task(id), refetchInterval: 20_000 });
}

function useStep(id: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (action: 'arrived-pickup' | 'picked-up' | 'start' | 'arrived' | 'returned') => riderApi.step(id, action, (await currentPosition(6_000)) ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task', id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
}

export function TaskScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useTask(id);
  const step = useStep(id);
  const toast = useToast();
  const qc = useQueryClient();
  const [release, setRelease] = useState(false);
  const [reason, setReason] = useState('');
  const t = q.data;

  const releaseM = useMutation({
    mutationFn: () => riderApi.release(id, reason || 'Unable to take this delivery'),
    onSuccess: () => {
      toast('Handed back - it will go to another rider', 'info');
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/', { replace: true });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (q.isLoading) return <div className="app"><TopBar title="Delivery" back /><Spinner /></div>;
  if (!t) return <div className="app"><TopBar title="Delivery" back /><div className="page"><div className="card empty">{errorMessage(q.error, 'This delivery is not available')}</div></div></div>;

  const points: MapPoint[] = [];
  if (t.pickup.latitude !== null && t.pickup.longitude !== null) points.push({ lat: t.pickup.latitude, lng: t.pickup.longitude, kind: 'store' });
  if (t.drop.latitude !== null && t.drop.longitude !== null) points.push({ lat: t.drop.latitude, lng: t.drop.longitude, kind: 'drop' });
  const toStore = ['ASSIGNED', 'AT_PICKUP', 'FAILED'].includes(t.status);
  const cod = t.payment.codAmount;
  const collected = Boolean(t.payment.collected);
  const finished = ['DELIVERED', 'RETURNED_TO_STORE', 'CANCELLED'].includes(t.status);

  let primary: { label: string; onClick: () => void; icon?: React.ReactNode } | null = null;
  if (t.status === 'ASSIGNED') primary = { label: "I've arrived at the store", onClick: () => step.mutate('arrived-pickup'), icon: <Store size={18} /> };
  else if (t.status === 'AT_PICKUP') primary = { label: 'Confirm pickup', onClick: () => step.mutate('picked-up'), icon: <Check size={18} /> };
  else if (t.status === 'PICKED_UP') primary = { label: 'Start delivery', onClick: () => step.mutate('start'), icon: <NavIcon size={18} /> };
  else if (t.status === 'OUT_FOR_DELIVERY') primary = { label: "I've arrived", onClick: () => step.mutate('arrived'), icon: <Pin size={18} /> };
  else if (t.status === 'AT_DROP') primary = cod > 0 && !collected
    ? { label: `Collect ${inr(cod)}`, onClick: () => navigate(`/task/${id}/cod`), icon: <Cash size={18} /> }
    : { label: 'Enter delivery OTP', onClick: () => navigate(`/task/${id}/deliver`), icon: <Check size={18} /> };
  else if (t.status === 'FAILED') primary = { label: "I've returned it to the store", onClick: () => step.mutate('returned'), icon: <Store size={18} /> };

  return (
    <div className="app">
      <TopBar title={`#${t.orderNumber ?? t.taskNumber}`} back="/" right={<span className={`chip ${t.status === 'FAILED' || t.status === 'CANCELLED' ? 'red' : t.status === 'DELIVERED' ? 'green' : 'orange'}`}>{STATUS_LABEL[t.status] ?? t.status}</span>} />
      <div className="page" style={{ paddingBottom: primary ? 110 : 24 }}>
        {points.length ? (
          <Link to={`/task/${id}/track`} style={{ display: 'block', position: 'relative' }} aria-label="Open the live map">
            <div style={{ pointerEvents: 'none' }}><MiniMap points={points} /></div>
            {!finished ? <span className="chip orange" style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 500, boxShadow: 'var(--shadow)' }}><Pin size={13} /> Track live</span> : null}
          </Link>
        ) : !finished ? (
          <Link to={`/task/${id}/track`} className="btn soft block"><Pin size={18} /> Track live</Link>
        ) : null}

        {/* Where to go next */}
        <div className="card" style={{ marginTop: 14 }}>
          <div className="kv-title" style={{ marginTop: 0 }}>{toStore ? 'Pickup from' : 'Deliver to'}</div>
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{toStore ? t.pickup.name : t.drop.name}</div>
          <div className="meta" style={{ fontSize: 13.5 }}><Pin size={15} /> {toStore ? t.pickup.address : t.drop.address}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <a className="btn soft medium" href={toStore ? t.pickup.navigationUrl : t.drop.navigationUrl} target="_blank" rel="noreferrer"><NavIcon size={18} /> Navigate</a>
            {(toStore ? t.pickup.phone : t.drop.phone) ? (
              <a className="btn outline medium" href={`tel:${toStore ? t.pickup.phone : t.drop.phone}`}><Phone size={18} /> Call</a>
            ) : (
              <button className="btn outline medium" disabled><Phone size={18} /> Call</button>
            )}
          </div>
        </div>

        {t.status === 'FAILED' ? (
          <div className="card" style={{ background: 'var(--red-soft)', color: '#b3264a', display: 'flex', gap: 10 }}>
            <Alert size={20} /> <div style={{ fontSize: 14 }}>Delivery could not be completed. Bring the order back to <b>{t.pickup.name}</b> and mark it returned.</div>
          </div>
        ) : null}

        {/* Payment */}
        <div className="card">
          <div className="between">
            <div>
              <div className="kv-title" style={{ marginTop: 0 }}>Payment</div>
              <div style={{ fontSize: 14, color: 'var(--ink)' }}>{cod > 0 ? 'Cash On Delivery' : 'Prepaid online'}</div>
            </div>
            {cod > 0 ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{inr(cod)}</div>
                {collected ? <span className="chip green"><Check size={13} /> Collected</span> : <span className="chip orange">To collect</span>}
              </div>
            ) : <span className="chip green">Nothing to collect</span>}
          </div>
        </div>

        {/* Items */}
        <div className="card">
          <div className="kv-title" style={{ marginTop: 0 }}>Items ({t.items.reduce((s, i) => s + i.quantity, 0)})</div>
          {t.items.map((i, k) => (
            <div key={k} className="row" style={{ padding: '8px 0', borderTop: k ? '1px solid var(--line)' : 'none' }}>
              {i.image ? <img src={i.image} alt="" className="thumb" style={{ width: 44, height: 44 }} /> : <div className="thumb" style={{ width: 44, height: 44 }} />}
              <div style={{ flex: 1, fontSize: 14, color: 'var(--ink)' }}>{i.name}</div>
              <b style={{ color: 'var(--ink)' }}>× {i.quantity}</b>
            </div>
          ))}
        </div>

        {/* Progress */}
        {t.status !== 'CANCELLED' ? (
          <div className="card">
            <div className="kv-title" style={{ marginTop: 0 }}>Progress</div>
            <div className="steps">
              {FLOW.map((f, k) => {
                const done = f.statuses.includes(t.status);
                const nextIdx = FLOW.findIndex((x) => !x.statuses.includes(t.status));
                return <div key={f.key} className={`stepi${done ? ' done' : k === nextIdx ? ' now' : ''}`}>{f.label}</div>;
              })}
            </div>
            {t.promisedBy && !finished ? <div className="muted" style={{ fontSize: 13 }}>Customer was promised delivery by <b style={{ color: 'var(--ink)' }}>{time(t.promisedBy)}</b></div> : null}
          </div>
        ) : null}

        {finished ? (
          <div className="card between">
            <span>{t.status === 'DELIVERED' ? 'You earned' : 'Earned for this trip'}</span>
            <b style={{ fontSize: 18, color: 'var(--green)' }}>{inr(t.earned)}</b>
          </div>
        ) : null}

        {['PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP'].includes(t.status) && !collected ? (
          <button className="btn block" style={{ marginTop: 14, background: 'none', color: 'var(--red)' }} onClick={() => navigate(`/task/${id}/fail`)}>Can't deliver this order</button>
        ) : null}
        {['ASSIGNED', 'AT_PICKUP'].includes(t.status) ? (
          <button className="btn block" style={{ marginTop: 14, background: 'none', color: 'var(--muted)' }} onClick={() => setRelease(true)}>I can't take this delivery</button>
        ) : null}
      </div>

      {primary ? (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, maxWidth: 480, margin: '0 auto', padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(to top, var(--bg) 70%, transparent)' }}>
          <button className="btn primary block" onClick={primary.onClick} disabled={step.isPending}>
            {primary.icon} {step.isPending ? 'Updating…' : primary.label}
          </button>
        </div>
      ) : null}

      <Modal open={release} onClose={() => setRelease(false)} sheet>
        <h3 style={{ margin: '0 0 6px', color: 'var(--ink)' }}>Hand this delivery back?</h3>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>It will be offered to another rider. You are not paid for it.</p>
        <Field label="Reason" required>
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vehicle trouble" />
        </Field>
        <button className="btn danger block" style={{ marginTop: 18 }} disabled={releaseM.isPending || reason.trim().length < 3} onClick={() => releaseM.mutate()}>Hand back</button>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- COD

export function CollectCod() {
  const { id = '' } = useParams();
  const q = useTask(id);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [ref, setRef] = useState('');
  const m = useMutation({
    mutationFn: async (t: TaskDetail) => riderApi.cod(id, { amount: t.payment.codAmount, method, reference: method === 'UPI' ? ref.trim() || undefined : undefined, ...((await currentPosition(5_000)) ?? {}) }),
    onSuccess: () => {
      toast('Payment recorded', 'success');
      void qc.invalidateQueries({ queryKey: ['task', id] });
      navigate(`/task/${id}/deliver`, { replace: true });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const t = q.data;
  if (q.isLoading) return <div className="app"><TopBar title="Collect Payment" back /><Spinner /></div>;
  if (!t) return <Navigate to={`/task/${id}`} replace />;
  if (t.payment.collected) return <Navigate to={`/task/${id}/deliver`} replace />;
  return (
    <div className="app">
      <TopBar title="Collect Payment" back />
      <div className="page" style={{ paddingTop: 22 }}>
        <div className="card" style={{ textAlign: 'center', padding: '26px 16px' }}>
          <div className="muted" style={{ fontSize: 14 }}>Collect from {t.drop.name}</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--ink)', margin: '6px 0' }}>{inr(t.payment.codAmount)}</div>
          <div className="chip orange">Exact amount - no more, no less</div>
        </div>
        <div className="section-title">How did the customer pay?</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {(['CASH', 'UPI'] as const).map((k) => (
            <button key={k} className={`btn ${method === k ? 'primary' : 'outline'}`} onClick={() => setMethod(k)}>{k === 'CASH' ? 'Cash' : 'UPI to company'}</button>
          ))}
        </div>
        {method === 'UPI' ? (
          <Field label="UPI reference" hint="From the payment confirmation on the customer's phone">
            <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 4312 8876 1290" />
          </Field>
        ) : (
          <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Cash goes into your cash-in-hand. Hand it to the store at the end of your shift.</p>
        )}
        <button className="btn primary block" style={{ marginTop: 24 }} disabled={m.isPending} onClick={() => m.mutate(t)}>
          <Cash size={18} /> I have collected {inr(t.payment.codAmount)}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- OTP

export function DeliverOtp() {
  const { id = '' } = useParams();
  const q = useTask(id);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => riderApi.deliver(id, code, (await currentPosition(5_000)) ?? {}),
    onSuccess: () => {
      toast('Delivered - great job!', 'success');
      void qc.invalidateQueries();
      navigate(`/task/${id}`, { replace: true });
    },
    onError: (e) => {
      const c = errorCode(e);
      if (c === 'COD_NOT_COLLECTED') navigate(`/task/${id}/cod`, { replace: true });
      setError(errorMessage(e));
      setCode('');
    },
  });
  const t = q.data;
  if (t && t.payment.codAmount > 0 && !t.payment.collected) return <Navigate to={`/task/${id}/cod`} replace />;
  return (
    <div className="app">
      <TopBar title="Delivery OTP" back />
      <div className="page" style={{ paddingTop: 22 }}>
        <h2 className="auth-title" style={{ marginTop: 0 }}>Enter The Code</h2>
        <p className="auth-sub">Ask {t?.drop.name ?? 'the customer'} for the delivery code shown in their app</p>
        <OtpInput value={code} length={t?.otpLength ?? 4} error={Boolean(error)} onChange={(v) => { setError(null); setCode(v); }} />
        {error ? <p style={{ textAlign: 'center', color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p> : null}
        <button className="btn primary block" style={{ marginTop: 20 }} disabled={code.length < (t?.otpLength ?? 4) || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? 'Checking…' : 'Complete Delivery'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- failed delivery

export function FailDelivery() {
  const { id = '' } = useParams();
  const q = useTask(id);
  const reasons = useQuery({ queryKey: ['failure-reasons'], queryFn: riderApi.failureReasons });
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [pick, setPick] = useState<FailureReason | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setUploading(true);
    try {
      setPhoto((await riderApi.uploadProof(f)).url);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  const m = useMutation({
    mutationFn: async () => riderApi.fail(id, { reasonCode: pick!.code, note: note.trim() || undefined, photoUrl: photo ?? undefined, ...((await currentPosition(5_000)) ?? {}) }),
    onSuccess: () => {
      toast('Recorded. Please return the order to the store.', 'info');
      void qc.invalidateQueries();
      navigate(`/task/${id}`, { replace: true });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const t = q.data;
  const atDrop = t?.status === 'AT_DROP';
  const ready = pick && (!pick.requiresNote || note.trim()) && (!pick.requiresPhoto || photo) && (!pick.requiresArrival || atDrop);
  return (
    <div className="app">
      <TopBar title="Can't Deliver" back />
      <div className="page" style={{ paddingTop: 18 }}>
        <p className="muted" style={{ margin: '0 2px 12px', fontSize: 14 }}>What happened? The order is not cancelled - the store decides the next step.</p>
        <div className="card" style={{ padding: 6 }}>
          {(reasons.data ?? []).map((r) => {
            const blocked = r.requiresArrival && !atDrop;
            return (
              <button key={r.id} disabled={blocked} onClick={() => setPick(r)} className="between"
                style={{ width: '100%', border: 'none', background: pick?.id === r.id ? 'var(--orange-soft)' : 'none', borderRadius: 12, padding: '14px 12px', textAlign: 'left', opacity: blocked ? 0.5 : 1 }}>
                <span>
                  <span style={{ display: 'block', fontSize: 15, color: 'var(--ink)', fontWeight: 500 }}>{r.label}</span>
                  {blocked ? <span className="muted" style={{ fontSize: 12 }}>Mark that you've arrived first</span> : null}
                </span>
                <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${pick?.id === r.id ? 'var(--orange)' : '#d0d0d8'}`, display: 'grid', placeItems: 'center' }}>
                  {pick?.id === r.id ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--orange)' }} /> : null}
                </span>
              </button>
            );
          })}
        </div>
        {pick ? (
          <>
            <Field label={`Note${pick.requiresNote ? '' : ' (optional)'}`} required={pick.requiresNote}>
              <textarea className="control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened at the door?" maxLength={500} />
            </Field>
            <div className="card between" style={{ marginTop: 14 }}>
              <span style={{ fontSize: 14 }}>{photo ? 'Photo added' : `Photo proof${pick.requiresPhoto ? ' (required)' : ' (optional)'}`}</span>
              <button className="btn soft small" onClick={() => file.current?.click()} disabled={uploading}><Camera size={16} /> {uploading ? 'Uploading…' : photo ? 'Retake' : 'Take photo'}</button>
              <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            </div>
          </>
        ) : null}
        <button className="btn danger block" style={{ marginTop: 22 }} disabled={!ready || m.isPending} onClick={() => m.mutate()}>Submit</button>
      </div>
    </div>
  );
}
