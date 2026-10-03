import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { riderApi, type Offer } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { ring, riderEvents, stopRing, type TaskAssigned } from '../live/alerts';
import { Deliver } from './icons';
import { Modal, useToast } from './kit';
import { OfferModal, RejectModal, useOfferResponse } from './orders';

/**
 * App-wide pop-ups, on every screen of an approved rider:
 *  - a new delivery request: rings (looping) until accepted, rejected, closed, expired or taken by another rider;
 *  - a delivery assigned to you (your own accept or by the store): rings once.
 * The list of open requests is the server's (GET /rider/offers); the socket only nudges a refetch.
 */
export function IncomingAlerts() {
  const { rider } = useAuth();
  const online = rider?.availability === 'ONLINE';
  const toast = useToast();
  const navigate = useNavigate();
  const offers = useQuery({ queryKey: ['offers'], queryFn: riderApi.offers, enabled: online, refetchInterval: online ? 15_000 : false });

  // Requests this rider has already closed the pop-up for (they stay on the dashboard).
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [rejecting, setRejecting] = useState<Offer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rung = useRef<Set<string>>(new Set());

  const dismiss = (offerId: string) => setDismissed((s) => new Set(s).add(offerId));

  const current = useMemo(
    () => (online ? (offers.data ?? []).find((o) => !dismissed.has(o.offerId) && new Date(o.expiresAt).getTime() > now) ?? null : null),
    [offers.data, dismissed, now, online],
  );

  // Re-evaluate expiry every second while a request is showing.
  useEffect(() => {
    if (!current) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [current]);

  // Ring once per new request; stop as soon as nothing is showing.
  useEffect(() => {
    if (current && !rejecting) {
      if (!rung.current.has(current.offerId)) {
        rung.current.add(current.offerId);
        ring(true);
      }
    } else stopRing();
  }, [current, rejecting]);
  useEffect(() => () => stopRing(), []);

  // Another rider got it / the store withdrew it.
  useEffect(
    () =>
      riderEvents.on('offer-closed', (c) => {
        dismiss(c.offerId);
        setRejecting((r) => (r?.offerId === c.offerId ? null : r));
        if (c.status === 'TAKEN' && rung.current.has(c.offerId)) toast('Another rider accepted that order first', 'info');
      }),
    [toast],
  );

  const respond = useOfferResponse(() => {
    if (current) dismiss(current.offerId);
    setRejecting(null);
  });

  return (
    <>
      {current && !rejecting ? (
        <OfferModal
          offer={current}
          heading="New delivery request"
          busy={respond.isPending}
          onClose={() => dismiss(current.offerId)}
          onAccept={() => {
            stopRing();
            respond.mutate({ offer: current, accept: true });
          }}
          onReject={() => {
            stopRing();
            setRejecting(current);
          }}
        />
      ) : null}
      <RejectModal offer={rejecting} busy={respond.isPending} onClose={() => { if (rejecting) dismiss(rejecting.offerId); setRejecting(null); }} onSubmit={(reason) => rejecting && respond.mutate({ offer: rejecting, accept: false, reason })} />
      <AssignedPopup onOpen={(taskId) => navigate(`/task/${taskId}`)} />
    </>
  );
}

/** "Order assigned to you" - after the rider's own accept or when the store assigns them. */
function AssignedPopup({ onOpen }: { onOpen: (taskId: string) => void }) {
  const [shown, setShown] = useState<TaskAssigned | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(
    () =>
      riderEvents.on('assigned', (a) => {
        if (seen.current.has(a.taskId)) return; // accept response and socket both announce it
        seen.current.add(a.taskId);
        ring(false);
        setShown(a);
      }),
    [],
  );

  if (!shown) return null;
  const close = () => {
    stopRing();
    setShown(null);
  };
  return (
    <Modal open onClose={close}>
      <div style={{ textAlign: 'center', padding: '12px 6px 4px' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--green-soft, #e8f7ee)', color: 'var(--green)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
          <Deliver size={36} />
        </div>
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: 'var(--ink)' }}>Order assigned to you</h3>
        <p className="muted" style={{ margin: '6px 0 16px', fontSize: 14 }}>
          {shown.by === 'STAFF' ? 'The store has given you a delivery.' : 'You got it - head to the store for pickup.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="btn success medium" onClick={() => { close(); onOpen(shown.taskId); }}>Open order</button>
          <button className="btn outline medium" onClick={close}>Later</button>
        </div>
      </div>
    </Modal>
  );
}
