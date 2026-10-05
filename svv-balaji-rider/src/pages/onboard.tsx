import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { riderApi } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { currentPosition, type Point } from '../live/geo';
import { Check, Chevron, Clock, Logout, X } from '../ui/icons';
import { MapArt } from '../ui/illustrations';
import { Logo, TopBar, useToast } from '../ui/kit';
import { MiniMap } from '../ui/MiniMap';
import { useVerification } from './verification';

/** "Add your current location" - asks for location permission, which the app needs to work. */
export function LocationScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pos, setPos] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);

  const allow = async () => {
    setBusy(true);
    const p = await currentPosition(12_000);
    setBusy(false);
    if (!p) {
      toast('Location is blocked. Turn it on in your browser or phone settings - it is needed to get nearby orders.', 'error');
      return;
    }
    setPos(p);
    await riderApi.location(p).catch(() => undefined);
    setTimeout(() => navigate('/', { replace: true }), 900);
  };

  return (
    <div className="app">
      <TopBar title="Select Location" back="/" />
      <div className="page" style={{ paddingTop: 20 }}>
        <div className="card" style={{ padding: 6, border: '1px solid #ffd49e' }}>
          {pos ? <MiniMap points={[{ lat: pos.latitude, lng: pos.longitude, kind: 'me' }]} height={180} /> : <div className="map" style={{ height: 180 }}><MapArt /></div>}
        </div>
        <h2 className="auth-title">{pos ? 'Location found' : 'Add Your Current Location'}</h2>
        <p className="auth-sub" style={{ lineHeight: 1.6 }}>
          We use your location to offer you orders from the nearest store and to confirm pickups and drop-offs. It is only shared while you are online.
        </p>
        <button className="btn primary block" style={{ marginTop: 26 }} onClick={allow} disabled={busy}>
          {busy ? 'Finding you…' : pos ? 'Continue' : 'Allow Location Access'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button className="link dark" style={{ fontSize: 13 }} onClick={() => navigate('/', { replace: true })}>Not now</button>
        </div>
      </div>
    </div>
  );
}

/** A signed-in rider whose application staff have not approved yet (or rejected). */
export function PendingScreen() {
  const { rider, reload, signOut } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const v = useVerification();

  if (!rider) return null;
  const rejected = rider.status === 'REJECTED';

  const checkStatus = async () => {
    setChecking(true);
    try {
      const updated = await riderApi.me();
      await reload();
      void qc.invalidateQueries();
      void v.refetch();

      if (updated.status === 'ACTIVE') {
        toast('Congratulations! Your application has been approved.', 'success');
      } else if (updated.status === 'REJECTED') {
        toast(updated.rejectionReason ?? 'Application not approved. Contact your store for details.', 'error');
      } else {
        toast('Application is still under review. We will notify you once approved.', 'info');
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="plain" style={{ padding: 'calc(28px + env(safe-area-inset-top)) 22px 24px' }}>
      <Logo />
      <div style={{ display: 'grid', placeItems: 'center', marginTop: 34 }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: rejected ? 'var(--red-soft)' : 'var(--orange-soft)', display: 'grid', placeItems: 'center', color: rejected ? 'var(--red)' : 'var(--orange)' }}>
          {rejected ? <X size={40} /> : <Clock size={40} />}
        </div>
      </div>
      <h2 className="auth-title">{rejected ? 'Application not approved' : 'Application under review'}</h2>
      <p className="auth-sub" style={{ lineHeight: 1.6 }}>
        {rejected
          ? rider.rejectionReason ?? 'Contact your nearest SVV Balaji store for details.'
          : 'Thanks, ' + rider.fullName.split(' ')[0] + '! Upload your documents and Police Clearance Certificate' + (v.data?.deposit.required ? ', pay the security deposit' : '') + ' - once our team has verified everything, they will assign you a store and you can start taking orders.'}
      </p>

      {!rejected ? (
        <button type="button" className="card between" onClick={() => navigate('/verification')} style={{ marginTop: 24, width: '100%', textAlign: 'left', cursor: 'pointer', border: v.data && !v.data.eligible ? '1px solid #ffd49e' : undefined }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Documents, PCC & deposit</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {!v.data ? 'Loading…' : v.data.eligible ? 'All done - waiting for approval' : `${v.data.missing.length} ${v.data.missing.length === 1 ? 'item' : 'items'} left: ${v.data.missing[0]}${v.data.missing.length > 1 ? '…' : ''}`}
            </div>
          </div>
          <span className="row" style={{ gap: 6, color: 'var(--orange)', fontWeight: 600, fontSize: 14, flex: 'none' }}>{v.data?.eligible ? 'View' : 'Complete'} <Chevron size={18} /></span>
        </button>
      ) : null}

      <div className="card" style={{ marginTop: 14 }}>
        {[
          ['Account created', true],
          ['Mobile number verified', true],
          ['Documents approved', (v.data?.documents.every((d) => !d.mandatory || d.satisfied) ?? false)],
          ['Police Clearance Certificate approved', v.data?.pcc?.satisfied ?? false],
          ...(v.data?.deposit.required ? [['Security deposit paid', v.data.deposit.satisfied] as const] : []),
          ['Approved and store assigned', rider.status === 'ACTIVE'],
        ].map(([label, ok]) => (
          <div key={String(label)} className="row" style={{ padding: '8px 0', color: ok ? 'var(--ink)' : 'var(--muted)', fontSize: 14 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: ok ? 'var(--green-soft)' : '#f0f0f3', color: ok ? 'var(--green)' : '#b5b5bd' }}>
              {ok ? <Check size={15} /> : <Clock size={14} />}
            </span>
            {label}
          </div>
        ))}
      </div>

      {(rider.warehouse?.name || rider.maxActiveTasks) ? (
        <div className="card" style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--ink)' }}>Assigned Dispatch Settings</div>
          <div className="between" style={{ fontSize: 13, marginBottom: 6 }}>
            <span className="muted">Home Outlet</span>
            <b style={{ color: 'var(--ink)' }}>{rider.warehouse?.name ?? 'Not assigned'}</b>
          </div>
          <div className="between" style={{ fontSize: 13 }}>
            <span className="muted">Deliveries at once</span>
            <b style={{ color: 'var(--ink)' }}>{rider.maxActiveTasks ?? 1}</b>
          </div>
        </div>
      ) : null}

      <button className="btn outline block" style={{ marginTop: 22 }} disabled={checking} onClick={checkStatus}>
        {checking ? 'Checking status…' : 'Check status'}
      </button>
      <button className="btn block" style={{ marginTop: 10, background: 'none', color: 'var(--muted)' }} onClick={() => void signOut()}>
        <Logout size={18} /> Sign out
      </button>
    </div>
  );
}
