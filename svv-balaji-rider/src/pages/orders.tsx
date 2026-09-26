import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { riderApi, type Offer } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { Box, Check, Return, Truck } from '../ui/icons';
import { Spinner, TopBar } from '../ui/kit';
import { OfferCard, OfferModal, RejectModal, TaskCard, useOfferResponse } from '../ui/orders';

type Tab = 'new' | 'active' | 'delivered' | 'returned';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'new', label: 'New order' },
  { key: 'active', label: 'Active' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'returned', label: 'Returned' },
];

/**
 * Orders: requests waiting for an answer, deliveries in hand, and finished
 * ones (delivered / returned or cancelled). The tab lives in the URL (?tab=).
 */
export function Orders() {
  const { rider } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'new') as Tab;
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: riderApi.dashboard, refetchInterval: 30_000 });
  const active = useQuery({ queryKey: ['tasks', 'active'], queryFn: () => riderApi.tasks('active'), refetchInterval: 30_000 });
  const history = useQuery({ queryKey: ['tasks', 'history'], queryFn: () => riderApi.tasks('history'), enabled: tab === 'delivered' || tab === 'returned' });
  const [open, setOpen] = useState<Offer | null>(null);
  const [rejecting, setRejecting] = useState<Offer | null>(null);
  const respond = useOfferResponse(() => {
    setOpen(null);
    setRejecting(null);
  });
  const askReject = (o: Offer) => {
    setOpen(null);
    setRejecting(o);
  };

  const offers = dash.data?.offers ?? [];
  const inHand = active.data ?? [];
  const done = history.data ?? [];
  const delivered = done.filter((t) => t.status === 'DELIVERED');
  const returned = done.filter((t) => t.status !== 'DELIVERED');
  const online = (dash.data?.rider.availability ?? rider?.availability) === 'ONLINE';
  const count: Partial<Record<Tab, number>> = { new: offers.length, active: inHand.length };

  const loading = tab === 'new' ? dash.isLoading : tab === 'active' ? active.isLoading : history.isLoading;

  return (
    <div className="app">
      <TopBar title="Orders" back="/" />
      <div className="page with-nav" style={{ paddingTop: 14 }}>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab${tab === t.key ? ' on' : ''}`}
              onClick={() => setParams(t.key === 'new' ? {} : { tab: t.key }, { replace: true })}>
              {t.label}
              {count[t.key] ? <span className="n">{count[t.key]}</span> : null}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : tab === 'new' ? (
          offers.length === 0 ? (
            <Empty icon={<Box size={40} />} text={online ? 'No new orders right now. New requests appear here instantly.' : "You're offline. Go online from the dashboard to get orders."} />
          ) : offers.map((o) => (
            <OfferCard key={o.offerId} offer={o} busy={respond.isPending} onOpen={() => setOpen(o)} onAccept={() => respond.mutate({ offer: o, accept: true })} onReject={() => askReject(o)} />
          ))
        ) : tab === 'active' ? (
          inHand.length === 0 ? <Empty icon={<Truck size={40} />} text="No deliveries in hand. Accept a new order to start." /> : inHand.map((t) => <TaskCard key={t.id} t={t} />)
        ) : tab === 'delivered' ? (
          delivered.length === 0 ? <Empty icon={<Check size={40} />} text="Orders you deliver will show here." /> : delivered.map((t) => <TaskCard key={t.id} t={t} />)
        ) : returned.length === 0 ? (
          <Empty icon={<Return size={40} />} text="No returned or cancelled orders." />
        ) : returned.map((t) => <TaskCard key={t.id} t={t} />)}
      </div>
      <OfferModal offer={open} busy={respond.isPending} onClose={() => setOpen(null)} onAccept={() => open && respond.mutate({ offer: open, accept: true })} onReject={() => open && askReject(open)} />
      <RejectModal offer={rejecting} busy={respond.isPending} onClose={() => setRejecting(null)} onSubmit={(reason) => rejecting && respond.mutate({ offer: rejecting, accept: false, reason })} />
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="card empty">{icon}<div>{text}</div></div>;
}
