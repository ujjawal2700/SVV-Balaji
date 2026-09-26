import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { riderApi } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { Bell, Box, Cash, Chevron, Clock, Logout, Store, Truck, User, Wallet } from '../ui/icons';
import { Spinner, TopBar, date, inr, time } from '../ui/kit';
import { STATUS_LABEL } from '../ui/orders';

export function History() {
  const q = useQuery({ queryKey: ['tasks', 'history'], queryFn: () => riderApi.tasks('history') });
  return (
    <div className="app">
      <TopBar title="History" />
      <div className="page with-nav">
        {q.isLoading ? <Spinner /> : (q.data ?? []).length === 0 ? (
          <div className="card empty"><Clock size={40} /><div>Your completed deliveries will show here.</div></div>
        ) : (
          (q.data ?? []).map((t) => (
            <Link key={t.id} to={`/task/${t.id}`} className="card" style={{ display: 'block' }}>
              <div className="between">
                <b style={{ color: 'var(--ink)' }}>{t.dropName}</b>
                <span className={`chip ${t.status === 'DELIVERED' ? 'green' : t.status === 'CANCELLED' ? 'grey' : 'red'}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
              </div>
              <div className="between" style={{ marginTop: 6 }}>
                <span className="muted" style={{ fontSize: 13 }}>#{t.orderNumber ?? t.taskNumber} · {date(t.deliveredAt ?? t.updatedAt)} {time(t.deliveredAt ?? t.updatedAt)}</span>
                <b style={{ color: t.earned > 0 ? 'var(--green)' : 'var(--muted)' }}>{inr(t.earned)}</b>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  BASE: 'Base pay', DISTANCE: 'Distance', PEAK: 'Peak-hour incentive', ZONE_INCENTIVE: 'Zone incentive', DAILY_BONUS: 'Daily target bonus',
  WEEKLY_BONUS: 'Weekly target bonus', WAITING: 'Waiting time', OUTCOME: 'Cancelled / failed trip pay', ADJUSTMENT: 'Adjustment',
};

export function EarningsScreen() {
  const q = useQuery({ queryKey: ['earnings'], queryFn: () => riderApi.earnings() });
  const e = q.data;
  return (
    <div className="app">
      <TopBar title="Earnings" back />
      <div className="page">
        {!e ? <Spinner /> : (
          <>
            <div className="card" style={{ background: 'var(--orange)', color: '#fff' }}>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Today</div>
              <div style={{ fontSize: 34, fontWeight: 700 }}>{inr(e.today)}</div>
              <div className="between" style={{ marginTop: 8, fontSize: 13 }}>
                <span>This week <b>{inr(e.thisWeek)}</b></span>
                <span>{e.range.deliveries} deliveries this week</span>
              </div>
            </div>
            {Object.keys(e.byType).length ? (
              <div className="card">
                <div className="kv-title" style={{ marginTop: 0 }}>This week by type</div>
                {Object.entries(e.byType).map(([k, v]) => (
                  <div key={k} className="between" style={{ padding: '6px 0', fontSize: 14 }}><span>{TYPE_LABEL[k] ?? k}</span><b style={{ color: 'var(--ink)' }}>{inr(v)}</b></div>
                ))}
              </div>
            ) : null}
            <div className="section-title">Recent</div>
            {e.lines.length === 0 ? <div className="card empty"><Wallet size={40} /><div>Complete a delivery to start earning.</div></div> : (
              <div className="card" style={{ padding: '4px 16px' }}>
                {e.lines.map((l, k) => (
                  <div key={l.id} className="between" style={{ padding: '12px 0', borderTop: k ? '1px solid var(--line)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{TYPE_LABEL[l.type] ?? l.type}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{l.orderNumber ? `#${l.orderNumber} · ` : ''}{date(l.earnedAt)} {time(l.earnedAt)}{l.note ? ` · ${l.note}` : ''}</div>
                    </div>
                    <b style={{ color: l.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>{l.amount >= 0 ? '+' : ''}{inr(l.amount)}</b>
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

export function CashScreen() {
  const q = useQuery({ queryKey: ['cash'], queryFn: riderApi.cash });
  const c = q.data;
  return (
    <div className="app">
      <TopBar title="Cash in Hand" back />
      <div className="page">
        {!c ? <Spinner /> : (
          <>
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div className="muted" style={{ fontSize: 14 }}>You are holding</div>
              <div style={{ fontSize: 38, fontWeight: 700, color: 'var(--ink)' }}>{inr(c.balance)}</div>
              <div className="muted" style={{ fontSize: 13 }}>Hand this to your store. It is recorded there.</div>
            </div>
            <div className="section-title">Activity</div>
            {c.entries.length === 0 ? <div className="card empty"><Cash size={40} /><div>No cash collected yet.</div></div> : (
              <div className="card" style={{ padding: '4px 16px' }}>
                {c.entries.map((x, k) => (
                  <div key={x.id} className="between" style={{ padding: '12px 0', borderTop: k ? '1px solid var(--line)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--ink)' }}>{x.type === 'COD_COLLECTED' ? 'COD collected' : x.type === 'DEPOSITED' ? 'Handed to store' : 'Adjustment'}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{x.reference ?? ''} {date(x.createdAt)} {time(x.createdAt)}</div>
                    </div>
                    <b style={{ color: x.amount >= 0 ? 'var(--ink)' : 'var(--green)' }}>{x.amount >= 0 ? '+' : '−'}{inr(Math.abs(x.amount))}</b>
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

export function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: riderApi.notifications });
  const read = useMutation({ mutationFn: () => riderApi.markRead(), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const list = q.data ?? [];
  return (
    <div className="app">
      <TopBar title="Notifications" back right={list.some((n) => !n.readAt) ? <button className="link" style={{ fontSize: 13 }} onClick={() => read.mutate()}>Mark read</button> : null} />
      <div className="page">
        {q.isLoading ? <Spinner /> : list.length === 0 ? <div className="card empty"><Bell size={40} /><div>Nothing yet.</div></div> : list.map((n) => (
          <Link key={n.id} to={n.taskId ? `/task/${n.taskId}` : '#'} className="card" style={{ display: 'flex', gap: 12, opacity: n.readAt ? 0.7 : 1 }}>
            <div className="thumb" style={{ width: 42, height: 42, background: n.readAt ? 'var(--bg)' : 'var(--orange-soft)' }}><Bell size={20} /></div>
            <div style={{ flex: 1 }}>
              <div className="between"><b style={{ color: 'var(--ink)', fontSize: 14 }}>{n.title}</b><span className="muted" style={{ fontSize: 11 }}>{time(n.createdAt)}</span></div>
              <div className="muted" style={{ fontSize: 13 }}>{n.body}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Profile() {
  const { rider, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!rider) return null;
  const rows: Array<[string, React.ReactNode, React.ReactNode]> = [
    ['Rider ID', rider.code ?? '—', <User size={18} key="u" />],
    ['Mobile', rider.phone, <User size={18} key="p" />],
    ['Store', rider.warehouse?.name ?? 'Not assigned', <Store size={18} key="s" />],
    ['Vehicle', [rider.vehicleType?.replace('_', ' ').toLowerCase(), rider.vehicleNumber].filter(Boolean).join(' · ') || '—', <Truck size={18} key="t" />],
  ];
  return (
    <div className="app">
      <TopBar title="Profile" />
      <div className="page with-nav">
        <div className="card" style={{ textAlign: 'center', padding: '22px 16px' }}>
          <div style={{ width: 72, height: 72, margin: '0 auto', borderRadius: '50%', background: 'var(--orange)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 600, overflow: 'hidden' }}>
            {rider.photoUrl ? <img src={rider.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : rider.fullName.charAt(0)}
          </div>
          <h2 style={{ margin: '10px 0 2px', fontSize: 18, color: 'var(--ink)' }}>{rider.fullName}</h2>
          <span className={`chip ${rider.availability === 'ONLINE' ? 'green' : 'grey'}`}>{rider.availability === 'ONLINE' ? 'Online' : 'Offline'}</span>
        </div>
        <div className="card" style={{ padding: '4px 16px' }}>
          {rows.map(([k, v, i], n) => (
            <div key={k} className="between" style={{ padding: '13px 0', borderTop: n ? '1px solid var(--line)' : 'none', fontSize: 14 }}>
              <span className="row muted"><span style={{ color: 'var(--orange)' }}>{i}</span>{k}</span>
              <b style={{ color: 'var(--ink)', textTransform: k === 'Vehicle' ? 'capitalize' : 'none' }}>{v}</b>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: '4px 16px' }}>
          {[
            ['/earnings', 'Earnings', <Wallet size={18} key="w" />],
            ['/cash', 'Cash in hand', <Cash size={18} key="c" />],
            ['/notifications', 'Notifications', <Bell size={18} key="b" />],
            ['/forgot', 'Change password', <Box size={18} key="x" />],
          ].map(([to, label, icon], n) => (
            <Link key={String(to)} to={String(to)} className="between" style={{ padding: '14px 0', borderTop: n ? '1px solid var(--line)' : 'none', fontSize: 15, color: 'var(--ink)' }}>
              <span className="row"><span style={{ color: 'var(--orange)' }}>{icon}</span>{label}</span>
              <Chevron size={18} style={{ color: '#c4c4cc' }} />
            </Link>
          ))}
        </div>
        <button className="btn outline block" style={{ marginTop: 16 }} disabled={busy} onClick={async () => { setBusy(true); try { await signOut(); } catch (e) { alert(errorMessage(e)); } finally { setBusy(false); } }}>
          <Logout size={18} /> Sign out
        </button>
      </div>
    </div>
  );
}
