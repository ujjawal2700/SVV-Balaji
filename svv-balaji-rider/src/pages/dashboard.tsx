import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { riderApi, type Offer } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { currentPosition } from '../live/geo';
import { Bell, Box, CancelIco, Cash, Chevron, Clock, Deliver, Gift, Logout, Menu, Return, Truck, User, Wallet, X } from '../ui/icons';
import { Spinner, TopBar, inr, useToast } from '../ui/kit';
import { OfferCard, OfferModal, RejectModal, TaskCard, useOfferResponse } from '../ui/orders';

export { STATUS_LABEL } from '../ui/orders';

export function OnlineToggle({ online, disabled }: { online: boolean; disabled?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { reload } = useAuth();
  const m = useMutation({
    mutationFn: async (next: boolean) => riderApi.availability(next, next ? (await currentPosition(6_000)) ?? {} : {}),
    onSuccess: (r) => {
      toast(r.availability === 'ONLINE' ? "You're online - new orders will come to you" : "You're offline", r.availability === 'ONLINE' ? 'success' : 'info');
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void reload();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  return (
    <button className={`toggle ${online ? 'on' : 'off'}`} disabled={disabled || m.isPending} onClick={() => m.mutate(!online)} aria-pressed={online}>
      {m.isPending ? '…' : online ? 'Online' : 'Offline'} <i />
    </button>
  );
}

function SideMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { rider, signOut } = useAuth();
  const navigate = useNavigate();
  if (!open || !rider) return null;
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  const items = [
    { to: '/orders', label: 'Orders', icon: <Truck /> },
    { to: '/earnings', label: 'Earnings', icon: <Wallet /> },
    { to: '/cash', label: 'Cash in hand', icon: <Cash /> },
    { to: '/history', label: 'Delivery history', icon: <Clock /> },
    { to: '/notifications', label: 'Notifications', icon: <Bell /> },
    { to: '/profile', label: 'Profile', icon: <User /> },
  ];
  return (
    <div className="overlay" style={{ placeItems: 'stretch start', padding: 0 }} onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} style={{ width: 'min(300px, 82vw)', background: '#fff', height: '100%', padding: 'calc(22px + env(safe-area-inset-top)) 18px 22px', animation: 'rise .2s ease', display: 'flex', flexDirection: 'column' }}>
        <div className="between">
          <div className="row">
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--orange)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 18 }}>
              {rider.fullName.charAt(0)}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{rider.fullName}</div>
              <div className="muted" style={{ fontSize: 12 }}>{rider.code} · {rider.warehouse?.name}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close menu"><X /></button>
        </div>
        <nav style={{ marginTop: 24, flex: 1 }}>
          {items.map((i) => (
            <button key={i.to} onClick={() => go(i.to)} className="between" style={{ width: '100%', border: 'none', background: 'none', padding: '14px 4px', fontSize: 15, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>
              <span className="row" style={{ color: 'var(--ink)' }}><span style={{ color: 'var(--orange)' }}>{i.icon}</span>{i.label}</span>
              <Chevron size={18} style={{ color: '#c4c4cc' }} />
            </button>
          ))}
        </nav>
        <button className="btn outline block" onClick={() => void signOut()}><Logout size={18} /> Sign out</button>
      </aside>
    </div>
  );
}

export function Dashboard() {
  const { rider } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<Offer | null>(null);
  const [rejecting, setRejecting] = useState<Offer | null>(null);
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: riderApi.dashboard, refetchInterval: 30_000 });
  const unread = useQuery({ queryKey: ['notifications'], queryFn: riderApi.notifications, select: (n) => n.filter((x) => !x.readAt).length });
  const respond = useOfferResponse(() => {
    setOpen(null);
    setRejecting(null);
  });
  const askReject = (o: Offer) => {
    setOpen(null);
    setRejecting(o);
  };

  const d = dash.data;
  const online = (d?.rider.availability ?? rider?.availability) === 'ONLINE';

  return (
    <div className="app">
      <TopBar
        leftTitle
        title="Dashboard"
        left={<button className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}><Menu /></button>}
        right={
          <div className="row" style={{ gap: 6 }}>
            <OnlineToggle online={online} />
            <button className="icon-btn" aria-label="Notifications" onClick={() => navigate('/notifications')}>
              <Bell />
              {unread.data ? <span className="dot-badge" /> : null}
            </button>
          </div>
        }
      />
      <div className="page with-nav">
        {dash.isLoading ? (
          <Spinner />
        ) : !d ? (
          <div className="card empty">{errorMessage(dash.error)}</div>
        ) : (
          <>
            <div className="card" style={{ padding: 14 }}>
              <div className="stats">
                <div className="stat mint"><div className="ico"><Gift size={30} /></div><div className="label">Complete Delivery</div><div className="value">{d.today.completed}</div></div>
                <div className="stat cream"><div className="ico"><Deliver size={30} /></div><div className="label">Pending Delivery</div><div className="value">{d.today.pending}</div></div>
                <div className="stat pink"><div className="ico"><CancelIco size={30} /></div><div className="label">Cancel Delivery</div><div className="value">{d.today.cancelled}</div></div>
                <div className="stat lav"><div className="ico"><Return size={30} /></div><div className="label">Return Delivery</div><div className="value">{d.today.returned}</div></div>
              </div>
              {d.cashInHand > 0 ? (
                <Link to="/cash" className="between" style={{ marginTop: 12, background: 'var(--orange-soft)', borderRadius: 12, padding: '10px 12px', color: 'var(--orange-dark)', fontSize: 14 }}>
                  <span className="row"><Cash size={18} /> Cash in hand</span><b>{inr(d.cashInHand)}</b>
                </Link>
              ) : null}
            </div>

            {d.active.length ? (
              <>
                <div className="section-title">In progress</div>
                {d.active.map((t) => <TaskCard key={t.id} t={t} />)}
              </>
            ) : null}

            <div className="section-title">
              New Orders
              {!online ? <span className="chip grey">Go online to receive</span> : null}
            </div>
            {d.offers.length === 0 ? (
              <div className="card empty">
                <Box size={40} />
                <div>{online ? 'No new orders right now. New requests appear here instantly.' : "You're offline. Switch on to start getting orders."}</div>
              </div>
            ) : (
              d.offers.map((o) => (
                <OfferCard key={o.offerId} offer={o} busy={respond.isPending} onOpen={() => setOpen(o)} onAccept={() => respond.mutate({ offer: o, accept: true })} onReject={() => askReject(o)} />
              ))
            )}
            {!d.rider.outlet ? <div className="card" style={{ marginTop: 14 }}>No store assigned yet - contact your manager.</div> : null}
          </>
        )}
      </div>
      <OfferModal offer={open} busy={respond.isPending} onClose={() => setOpen(null)} onAccept={() => open && respond.mutate({ offer: open, accept: true })} onReject={() => open && askReject(open)} />
      <RejectModal offer={rejecting} busy={respond.isPending} onClose={() => setRejecting(null)} onSubmit={(reason) => rejecting && respond.mutate({ offer: rejecting, accept: false, reason })} />
      <SideMenu open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}
