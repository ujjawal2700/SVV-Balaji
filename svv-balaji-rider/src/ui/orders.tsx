import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { riderApi, type ItemPreview, type Offer, type TaskSummary } from '../api/rider';
import { Box, Clock, Pin, Send } from './icons';
import { ScooterArt } from './illustrations';
import { Modal, date, inr, time, useToast } from './kit';

/** Order and task pieces shared by the Dashboard, Orders and task screens (follows the supplied order-card design). */

export const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: 'Go to store', AT_PICKUP: 'At store', PICKED_UP: 'Picked up', OUT_FOR_DELIVERY: 'On the way', AT_DROP: 'At customer',
  FAILED: 'Return to store', DELIVERED: 'Delivered', RETURNED_TO_STORE: 'Returned', CANCELLED: 'Cancelled',
};

/** "Toor Dal 1kg" or "Toor Dal 1kg + 2 more". */
export function itemsTitle(items: ItemPreview[], count: number) {
  if (!items.length) return `${count || 'Order'} item${count === 1 ? '' : 's'}`;
  const more = items.length > 1 ? items.length - 1 : 0;
  return `${items[0].name}${more ? ` + ${more} more` : ''}`;
}

export function ItemThumb({ items, size = 76 }: { items: ItemPreview[]; size?: number }) {
  const img = items.find((i) => i.image)?.image;
  return (
    <div className="thumb" style={{ width: size, height: size }}>
      {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Box size={Math.round(size * 0.45)} />}
    </div>
  );
}

function Countdown({ until }: { until: string }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [until]);
  return <span className={`chip ${left <= 10 ? 'red' : 'orange'}`}><Clock size={13} /> {left}s</span>;
}

/** Accept / reject an offer, with the follow-up (open the task, refresh lists). */
export function useOfferResponse(onDone?: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ offer, accept, reason }: { offer: Offer; accept: boolean; reason?: string }) =>
      accept ? riderApi.accept(offer.offerId) : riderApi.reject(offer.offerId, reason),
    onSuccess: (r, v) => {
      onDone?.();
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      if (v.accept && r && typeof r === 'object' && 'taskId' in r) {
        toast('Accepted - head to the store', 'success');
        navigate(`/task/${(r as { taskId: string }).taskId}`);
      } else toast('Order rejected - it goes to another rider', 'info');
    },
    onError: (e) => {
      onDone?.();
      toast(errorMessage(e), 'error');
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** New order card: product, drop area, order no. + time, Accept / Reject. */
export function OfferCard({ offer, onOpen, onAccept, onReject, busy }: { offer: Offer; onOpen: () => void; onAccept: () => void; onReject: () => void; busy: boolean }) {
  return (
    <div className="card order" onClick={onOpen} role="button">
      <ItemThumb items={offer.items} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="between">
          <p className="title ellipsis" style={{ margin: 0 }}>{itemsTitle(offer.items, offer.itemCount)}</p>
          <Countdown until={offer.expiresAt} />
        </div>
        <div className="meta"><Pin size={15} /> <span className="ellipsis">{offer.dropArea}</span></div>
        <div className="meta"><span className="ellipsis">#{offer.orderNumber ?? offer.taskNumber} · {date(offer.offeredAt)}{offer.cod > 0 ? ` · COD ${inr(offer.cod)}` : ''}</span></div>
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn success small" onClick={onAccept} disabled={busy}>Accept</button>
          <button className="btn danger small" onClick={onReject} disabled={busy}>Reject</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Active / delivered / returned order card. The pin button opens the live
 * track screen for an order still in hand.
 */
export function TaskCard({ t }: { t: TaskSummary }) {
  const navigate = useNavigate();
  const live = !['DELIVERED', 'RETURNED_TO_STORE', 'CANCELLED'].includes(t.status);
  const when = t.deliveredAt ?? (live ? t.promisedBy ?? t.assignedAt : t.updatedAt) ?? t.updatedAt;
  const chip = t.status === 'DELIVERED' ? 'lav' : t.status === 'FAILED' || t.status === 'CANCELLED' ? 'red' : t.status === 'RETURNED_TO_STORE' ? 'grey' : 'green';
  const label = live ? (t.status === 'FAILED' ? 'Return to store' : 'Active Order') : STATUS_LABEL[t.status] ?? t.status;
  return (
    <Link to={`/task/${t.id}`} className="card order" style={{ display: 'flex' }}>
      <ItemThumb items={t.items} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="title ellipsis">{itemsTitle(t.items, t.itemCount)}</p>
        <div className="meta"><Pin size={15} /> <span className="ellipsis">{t.dropAddress}</span></div>
        <div className="meta"><Clock size={15} /> <span className="ellipsis">{date(when)} at {time(when)}</span></div>
        <div className="between" style={{ marginTop: 8 }}>
          <span className={`chip ${chip}`}>{label}</span>
          {live ? (
            <button className="pin-btn" aria-label="Track this order" onClick={(e) => { e.preventDefault(); navigate(`/task/${t.id}/track`); }}>
              <Pin size={16} />
            </button>
          ) : t.earned ? <b style={{ fontSize: 13, color: 'var(--green)' }}>+{inr(t.earned)}</b> : null}
        </div>
      </div>
    </Link>
  );
}

/** The "order details" pop-up from the design, for a request that has not been accepted yet. */
export function OfferModal({ offer, onClose, onAccept, onReject, busy }: { offer: Offer | null; onClose: () => void; onAccept: () => void; onReject: () => void; busy: boolean }) {
  if (!offer) return null;
  return (
    <Modal open onClose={onClose}>
      <div className="block row" style={{ alignItems: 'flex-start' }}>
        <ItemThumb items={offer.items} size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="between">
            <div className="ellipsis" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 16 }}>{itemsTitle(offer.items, offer.itemCount)}</div>
            <Countdown until={offer.expiresAt} />
          </div>
          <div className="between muted" style={{ fontSize: 13, marginTop: 4 }}>
            <span>{offer.cod > 0 ? <>COD: <b style={{ color: 'var(--ink)' }}>{inr(offer.cod)}</b></> : 'Prepaid'}</span>
            <span>Qty: <b style={{ color: 'var(--ink)' }}>{offer.itemCount}</b></span>
          </div>
          <div className="between muted" style={{ fontSize: 13, marginTop: 2 }}>
            <span className="ellipsis">#{offer.orderNumber ?? offer.taskNumber}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{date(offer.offeredAt)}</span>
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {offer.speed === 'QUICK' ? 'Quick' : 'Local'} · {offer.distanceKm !== null ? `${offer.distanceKm.toFixed(1)} km trip` : 'distance not pinned'}
          </div>
        </div>
      </div>
      <div className="block">
        <div className="kv-title">Location</div>
        <div className="meta"><Pin size={16} /> {offer.dropArea}</div>
        <div className="kv-title">Pickup</div>
        <div className="meta"><Box size={16} /> {offer.pickup.name}{offer.pickup.location ? `, ${offer.pickup.location}` : ''}</div>
        <div className="kv-title">Contact Us</div>
        <div className="muted" style={{ fontSize: 13 }}>Customer name and phone are shared once you accept.</div>
        <div className="kv-title">Payment</div>
        <div style={{ fontSize: 14, color: 'var(--ink)' }}>{offer.cod > 0 ? <>Cash On Delivery · <b>{inr(offer.cod)}</b></> : 'Prepaid - nothing to collect'}</div>
        <div className="kv-title">Date & Time</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><div className="muted" style={{ fontSize: 12 }}>Order Pickup Time</div><div className="meta" style={{ color: 'var(--ink)', fontSize: 14 }}><Clock size={16} /> Ready now</div></div>
          <div><div className="muted" style={{ fontSize: 12 }}>Delivery Time</div><div className="meta" style={{ color: 'var(--ink)', fontSize: 14 }}><Clock size={16} /> {offer.promisedBy ? time(offer.promisedBy) : 'Today'}</div></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <button className="btn success medium" onClick={onAccept} disabled={busy}>Confirm</button>
        <button className="btn danger medium" onClick={onReject} disabled={busy}>Cancel</button>
      </div>
    </Modal>
  );
}

/** "Write a specific reason to reject order" pop-up. The reason goes to the store with the rejection. */
export function RejectModal({ offer, onClose, onSubmit, busy }: { offer: Offer | null; onClose: () => void; onSubmit: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [offer?.offerId]);
  if (!offer) return null;
  const ok = reason.trim().length >= 3;
  return (
    <Modal open onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '10px 4px 4px' }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--ink)' }}>Write a Specific Reason to</h3>
        <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--red)' }}>Reject Order</div>
        <div style={{ margin: '10px 0 6px' }}><ScooterArt /></div>
        <form className="reason-input" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(reason.trim()); }}>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Type something here" maxLength={300} aria-label="Reason" />
          <button type="submit" className="icon-btn" disabled={!ok || busy} aria-label="Reject with this reason"><Send size={20} /></button>
        </form>
        <div className="reason-chips">
          {['Too far', 'Vehicle problem', 'Already on a delivery', 'Ending my shift'].map((r) => (
            <button key={r} type="button" className="chip grey" onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
