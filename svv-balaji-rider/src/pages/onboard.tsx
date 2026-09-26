import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { riderApi } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { currentPosition, type Point } from '../live/geo';
import { Camera, Check, Clock, Logout, X } from '../ui/icons';
import { MapArt } from '../ui/illustrations';
import { Logo, TopBar, useToast } from '../ui/kit';
import { MiniMap } from '../ui/MiniMap';

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
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  if (!rider) return null;
  const rejected = rider.status === 'REJECTED';

  const upload = async (f: File) => {
    setUploading(true);
    try {
      await riderApi.uploadDocument(f, 'document');
      toast('Licence photo uploaded', 'success');
      await reload();
      void qc.invalidateQueries();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
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
          : 'Thanks, ' + rider.fullName.split(' ')[0] + '! Our team will check your details and assign you to a store. You can start taking orders once approved.'}
      </p>

      {!rejected ? (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="between">
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Driving licence photo</div>
              <div className="muted" style={{ fontSize: 13 }}>Speeds up your approval</div>
            </div>
            <button className="btn soft small" onClick={() => file.current?.click()} disabled={uploading}>
              <Camera size={16} /> {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 14 }}>
        {[
          ['Account created', true],
          ['Mobile number verified', true],
          ['Approved and store assigned', false],
        ].map(([label, ok]) => (
          <div key={String(label)} className="row" style={{ padding: '8px 0', color: ok ? 'var(--ink)' : 'var(--muted)', fontSize: 14 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: ok ? 'var(--green-soft)' : '#f0f0f3', color: ok ? 'var(--green)' : '#b5b5bd' }}>
              {ok ? <Check size={15} /> : <Clock size={14} />}
            </span>
            {label}
          </div>
        ))}
      </div>

      <button className="btn outline block" style={{ marginTop: 22 }} onClick={() => void reload()}>Check status</button>
      <button className="btn block" style={{ marginTop: 10, background: 'none', color: 'var(--muted)' }} onClick={() => void signOut()}>
        <Logout size={18} /> Sign out
      </button>
    </div>
  );
}
