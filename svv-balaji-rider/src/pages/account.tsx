import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { riderApi, type VehicleType } from '../api/rider';
import { useAuth } from '../auth/AuthContext';
import { ArrowDownLeft, ArrowUpRight, Bell, Box, Camera, Cash, Chevron, Clock, Coin, Logout, Store, TrendingUp, Truck, User, Wallet } from '../ui/icons';
import { Spinner, TopBar, useToast, date, inr, time } from '../ui/kit';
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
  BASE: 'Base pay', DISTANCE: 'Distance', WEIGHT: 'Weight pay', PEAK: 'Peak-hour incentive', ZONE_INCENTIVE: 'Zone incentive', DAILY_BONUS: 'Daily target bonus',
  WEEKLY_BONUS: 'Weekly target bonus', WAITING: 'Waiting time', OUTCOME: 'Cancelled / failed trip pay', ADJUSTMENT: 'Adjustment',
};

export function EarningsScreen() {
  const q = useQuery({ queryKey: ['earnings'], queryFn: () => riderApi.earnings() });
  const cashQ = useQuery({ queryKey: ['cash'], queryFn: riderApi.cash });
  const payoutsQ = useQuery({ queryKey: ['payouts'], queryFn: riderApi.payouts });
  const [filterTab, setFilterTab] = useState<'all' | 'earnings' | 'withdrawals'>('all');

  const e = q.data;
  const cash = cashQ.data;
  const payouts = payoutsQ.data;
  const lastPayout = payouts?.payouts[0];
  const paidOut = (payouts?.payouts ?? []).reduce((s, p) => s + p.netPaid + p.cashOffset, 0);

  // Dynamically aggregate daily earnings totals for S M T W T F S from real API lines
  const dayTotals = [0, 0, 0, 0, 0, 0, 0]; // 0=Sun, 1=Mon, ..., 6=Sat
  if (e?.lines) {
    for (const line of e.lines) {
      const dayIdx = new Date(line.earnedAt).getDay();
      dayTotals[dayIdx] += line.amount;
    }
  }

  const maxDaySum = Math.max(...dayTotals, 1);
  const currentDayIndex = new Date().getDay();
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const bars = dayTotals.map((tot, idx) => {
    const hasData = dayTotals.some((t) => t > 0);
    // Nothing earned yet: every bar sits flat - never an invented shape.
    const heightPercent = hasData ? Math.max(6, Math.round((Math.max(0, tot) / maxDaySum) * 100)) : 6;
    const isHighlight = hasData ? tot === maxDaySum && tot > 0 : idx === currentDayIndex;

    return {
      day: dayLabels[idx],
      height: `${heightPercent}%`,
      highlight: isHighlight,
      amount: tot,
    };
  });

  // Dynamic Transaction Items combining order earnings & cash handovers
  const earningItems = (e?.lines ?? []).map((l) => ({
    id: l.id,
    type: 'EARNING' as const,
    title: TYPE_LABEL[l.type] ?? l.type,
    subtitle: `${l.orderNumber ? `#${l.orderNumber} · ` : ''}${date(l.earnedAt)}`,
    amount: l.amount,
    dateObj: new Date(l.earnedAt),
  }));

  // Pay settled to the rider: money received (and any COD cash they were allowed to keep).
  const payoutItems = (payouts?.payouts ?? []).map((p) => ({
    id: p.id,
    type: 'WITHDRAWAL' as const,
    title: `Pay settled · ${p.payoutNumber}`,
    subtitle: `${date(p.paidAt)} · ${p.method === 'BANK_TRANSFER' ? 'Bank' : p.method === 'UPI' ? 'UPI' : 'Cash'}${p.reference ? ` ${p.reference}` : ''}${p.cashOffset ? ` · ${inr(p.cashOffset)} cash kept` : ''}`,
    amount: p.netPaid + p.cashOffset,
    dateObj: new Date(p.paidAt),
  }));

  const cashItems = (cash?.entries ?? []).filter((c) => c.type === 'DEPOSITED').map((c) => ({
    id: c.id,
    type: 'WITHDRAWAL' as const,
    title: 'COD cash handed in',
    subtitle: date(c.createdAt),
    amount: -Math.abs(c.amount),
    dateObj: new Date(c.createdAt),
  }));

  const allTransactions = [...earningItems, ...payoutItems, ...cashItems].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

  const filteredTransactions = allTransactions.filter((item) => {
    if (filterTab === 'earnings') return item.type === 'EARNING';
    if (filterTab === 'withdrawals') return item.type === 'WITHDRAWAL';
    return true;
  });

  return (
    <div className="app">
      {/* Rider Theme Orange Header */}
      <div style={{ background: 'linear-gradient(135deg, var(--orange) 0%, var(--orange-dark) 100%)', padding: 'calc(16px + env(safe-area-inset-top)) 18px 26px', borderRadius: '0 0 26px 26px', color: '#fff', boxShadow: '0 8px 24px rgba(255,138,0,0.2)' }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <Link to="/" className="icon-btn" style={{ color: '#fff', background: 'rgba(255,255,255,0.22)', width: 38, height: 38 }} aria-label="Back">
            <Chevron size={20} style={{ transform: 'rotate(180deg)' }} />
          </Link>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff', flex: 1, marginLeft: 12 }}>Earnings</h1>
        </div>
      </div>

      <div className="page" style={{ marginTop: -10 }}>
        {!e ? <Spinner /> : (
          <>
            {/* 4 Stat Summary Cards in Rider Theme (2x2 Grid) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {/* Owed to the rider and not yet paid */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <div className="between">
                  <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Unpaid</span>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--orange-soft)', color: 'var(--orange-dark)', display: 'grid', placeItems: 'center' }}>
                    <Wallet size={16} />
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 6 }}>{inr(payouts?.unpaid ?? 0)}</div>
              </div>

              {/* Today */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <div className="between">
                  <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Today</span>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--orange-soft)', color: 'var(--orange-dark)', display: 'grid', placeItems: 'center' }}>
                    <Coin size={16} />
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 6 }}>{inr(e.today || 0)}</div>
              </div>

              {/* Range Total */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>This week</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{inr(e.thisWeek || 0)}</div>
                <div style={{ marginTop: 6 }}>
                  <span className="chip green" style={{ fontSize: 11, padding: '2px 8px', height: 20 }}>
                    <TrendingUp size={11} /> {e.range.deliveries} deliveries
                  </span>
                </div>
              </div>

              {/* Total Earned */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Paid out so far</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{inr(paidOut)}</div>
              </div>
            </div>

            {/* Dynamic Earnings Activity Card */}
            <div className="card" style={{ padding: 18, marginBottom: 14 }}>
              <div className="between" style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Earnings activity</span>
                <span className="muted" style={{ fontSize: 12 }}>This week</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, alignItems: 'center' }}>
                <div>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--orange-soft)', color: 'var(--orange-dark)', display: 'grid', placeItems: 'center' }}>
                      <Coin size={16} />
                    </div>
                    <span className="muted" style={{ fontSize: 13 }}>This Week</span>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', margin: '2px 0' }}>{inr(e.thisWeek)}</div>
                  <span className="chip green" style={{ fontSize: 11, padding: '2px 8px', height: 20, marginTop: 4 }}>
                    <TrendingUp size={11} /> {e.range.deliveries} trips
                  </span>
                </div>

                {/* Dynamic Weekly Bar Chart Pillars */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 100, padding: '0 4px' }}>
                  {bars.map((b, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }} title={`${b.day}: ${inr(b.amount)}`}>
                      <div
                        style={{
                          width: 14,
                          height: b.height,
                          borderRadius: 8,
                          background: b.highlight ? 'var(--orange)' : 'var(--orange-soft)',
                          transition: 'height 0.3s ease',
                        }}
                      />
                      <span style={{ fontSize: 11, fontWeight: b.highlight ? 700 : 500, color: b.highlight ? 'var(--orange-dark)' : 'var(--muted)' }}>{b.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* How pay reaches the rider: settled by the company, not requested here */}
            <div className="card" style={{ padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                {lastPayout ? `Last paid ${inr(lastPayout.netPaid)} on ${date(lastPayout.paidAt)}` : 'No pay settled yet'}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Your outlet settles your pay and records it here with its reference.
                {(payouts?.unpaid ?? 0) > 0 ? ` ${inr(payouts!.unpaid)} is earned and not paid yet.` : ''}
              </div>
            </div>

            {/* Transactions Section */}
            <div className="section-title" style={{ marginTop: 6, marginBottom: 12 }}>Transactions</div>
            <div className="card" style={{ padding: 16 }}>
              {/* Filter Tabs */}
              <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 3, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 16 }}>
                {(['all', 'earnings', 'withdrawals'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    style={{
                      border: 'none',
                      background: filterTab === tab ? '#fff' : 'transparent',
                      color: filterTab === tab ? 'var(--ink)' : 'var(--muted)',
                      borderRadius: 10,
                      padding: '8px 0',
                      fontSize: 13,
                      fontWeight: filterTab === tab ? 600 : 500,
                      boxShadow: filterTab === tab ? 'var(--shadow)' : 'none',
                      textTransform: 'capitalize',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tab === 'all' ? 'All' : tab === 'earnings' ? 'Earnings' : 'Pay & cash'}
                  </button>
                ))}
              </div>

              {/* Dynamic Transactions List */}
              {filteredTransactions.length === 0 ? (
                <div className="card empty" style={{ boxShadow: 'none', padding: '24px 0' }}>
                  <Wallet size={36} />
                  <div style={{ fontSize: 13, marginTop: 8 }}>No transaction history found for this filter.</div>
                </div>
              ) : (
                filteredTransactions.map((item, idx) => (
                  <div
                    key={item.id + idx}
                    className="between"
                    style={{
                      padding: '12px 0',
                      borderTop: idx ? '1px solid var(--line)' : 'none',
                    }}
                  >
                    <div className="row" style={{ gap: 12 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: item.type === 'EARNING' ? 'var(--green-soft)' : 'var(--orange-soft)',
                          color: item.type === 'EARNING' ? 'var(--green)' : 'var(--orange-dark)',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {item.type === 'EARNING' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{item.title}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{item.subtitle}</div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <b style={{ fontSize: 15, color: item.amount >= 0 ? 'var(--green)' : 'var(--ink)' }}>
                        {item.amount >= 0 ? `+${inr(item.amount)}` : `-${inr(Math.abs(item.amount))}`}
                      </b>
                      <div>
                        <span className="chip green" style={{ fontSize: 10, height: 18, padding: '0 6px', marginTop: 2 }}>
                          Completed
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface SuccessData {
  amount: number;
  paymentId: string;
}

export function CashScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cash'], queryFn: riderApi.cash });
  const meQ = useQuery({ queryKey: ['me'], queryFn: riderApi.me });
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [settling, setSettling] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  const c = q.data;

  const handleSettle = async () => {
    if (!c) return;
    const amountNum = customAmount ? parseFloat(customAmount) : c.balance;
    if (isNaN(amountNum) || amountNum <= 0) {
      toast('Enter a valid settlement amount', 'error');
      return;
    }
    if (amountNum > c.balance) {
      toast(`Amount cannot exceed holding balance ₹${c.balance}`, 'error');
      return;
    }

    setSettling(true);
    try {
      const order = await riderApi.createSettlementOrder(amountNum);
      const cfg = order.clientConfig || {};

      if (cfg.provider === 'mock') {
        const mockPayId = `mockpay_${Date.now()}`;
        await riderApi.verifyCashSettlement({
          amount: order.amount,
          gatewayOrderId: order.gatewayOrderId,
          paymentId: mockPayId,
          signature: 'mock_signature',
        });
        setShowModal(false);
        setCustomAmount('');
        setSettling(false);
        setSuccessData({ amount: order.amount, paymentId: mockPayId });
        qc.invalidateQueries({ queryKey: ['cash'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      } else {
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          toast('Failed to load Razorpay gateway. Check internet connection.', 'error');
          setSettling(false);
          return;
        }

        const options = {
          key: cfg.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: cfg.amount,
          currency: cfg.currency || 'INR',
          name: 'SVV Balaji Super Admin',
          description: `Rider Cash Settlement (₹${order.amount})`,
          order_id: order.gatewayOrderId,
          prefill: {
            name: meQ.data?.fullName,
            contact: meQ.data?.phone,
            email: meQ.data?.email,
          },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              await riderApi.verifyCashSettlement({
                amount: order.amount,
                gatewayOrderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });
              setShowModal(false);
              setCustomAmount('');
              setSuccessData({ amount: order.amount, paymentId: response.razorpay_payment_id });
              qc.invalidateQueries({ queryKey: ['cash'] });
              qc.invalidateQueries({ queryKey: ['dashboard'] });
            } catch (err) {
              toast(errorMessage(err, 'Settlement verification failed'), 'error');
            } finally {
              setSettling(false);
            }
          },
          modal: {
            ondismiss: () => {
              setSettling(false);
            },
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      }
    } catch (err) {
      toast(errorMessage(err, 'Failed to start Razorpay payment'), 'error');
      setSettling(false);
    }
  };

  return (
    <div className="app">
      <TopBar title="Cash in Hand" back />
      <div className="page">
        {!c ? <Spinner /> : (
          <>
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div className="muted" style={{ fontSize: 14 }}>You are holding</div>
              <div style={{ fontSize: 38, fontWeight: 700, color: 'var(--ink)' }}>{inr(c.balance)}</div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Hand this to store or pay Super Admin directly via Razorpay.</div>
              {c.balance > 0 ? (
                <button
                  className="btn primary"
                  style={{ width: '100%', padding: '12px 16px', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onClick={() => {
                    setCustomAmount(String(c.balance));
                    setShowModal(true);
                  }}
                >
                  <Wallet size={18} /> Pay Administrator (Razorpay)
                </button>
              ) : null}
            </div>

            {showModal ? (
              <div className="card" style={{ border: '2px solid var(--orange)', background: '#fff', padding: 16, marginBottom: 16 }}>
                <b style={{ fontSize: 16, color: 'var(--ink)', display: 'block', marginBottom: 8 }}>Settle Cash via Razorpay</b>
                <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                  Pay Super Admin directly via UPI/Netbanking/Card to clear your cash-in-hand collection.
                </p>

                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Amount to Pay (₹)</label>
                <input
                  type="number"
                  className="input"
                  placeholder={`Max ₹${c.balance}`}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  style={{ marginTop: 4, marginBottom: 12, width: '100%', fontSize: 16 }}
                />

                <div className="between" style={{ gap: 8 }}>
                  <button
                    className="btn secondary"
                    style={{ flex: 1 }}
                    disabled={settling}
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn primary"
                    style={{ flex: 1 }}
                    disabled={settling}
                    onClick={handleSettle}
                  >
                    {settling ? 'Opening Gateway...' : 'Pay via Razorpay'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="section-title">Activity</div>
            {c.entries.length === 0 ? <div className="card empty"><Cash size={40} /><div>No cash collected yet.</div></div> : (
              <div className="card" style={{ padding: '4px 16px' }}>
                {c.entries.map((x, k) => (
                  <div key={x.id} className="between" style={{ padding: '12px 0', borderTop: k ? '1px solid var(--line)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                        {x.type === 'COD_COLLECTED' ? 'COD collected' : x.type === 'DEPOSITED' ? (x.note?.includes('Razorpay') ? 'Online Razorpay settlement' : 'Handed to store') : 'Adjustment'}
                      </div>
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

      {successData ? (
        <div className="overlay" style={{ zIndex: 999, background: 'rgba(20, 20, 25, 0.55)', backdropFilter: 'blur(5px)' }}>
          <div
            className="modal"
            style={{
              maxWidth: 360,
              borderRadius: 28,
              padding: '28px 20px 24px',
              textAlign: 'center',
              background: '#fdfbf7',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              border: '1px solid #efe9dc',
            }}
          >
            {/* Dark Circle Badge with Party Popper / Confetti Icon */}
            <div
              style={{
                width: 90,
                height: 90,
                borderRadius: '50%',
                background: '#0e3a40',
                margin: '0 auto 20px',
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 10px 25px rgba(14,58,64,0.3)',
              }}
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#52c41a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.8 11.3 2 22l10.7-3.8Z" fill="#ffc107" stroke="#ffc107" />
                <path d="M4 3h.01M20 3h.01M12 2h.01M17 7h.01M7 7h.01M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                <circle cx="18" cy="11" r="2" fill="#40a9ff" stroke="none" />
                <circle cx="6" cy="7" r="1.5" fill="#ff7875" stroke="none" />
                <circle cx="15" cy="4" r="1.5" fill="#52c41a" stroke="none" />
                <path d="m11 13 8-8" stroke="#ff4d4f" strokeWidth="2.5" />
                <path d="M14 17l6 2" stroke="#ff9c6e" strokeWidth="2" />
              </svg>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px' }}>
              Payment Successful
            </h2>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 18px' }}>
              Thanks for your settlement.
            </p>

            <div
              style={{
                background: '#f3efe6',
                borderRadius: 16,
                padding: '14px 16px',
                marginBottom: 22,
                fontSize: 13,
                textAlign: 'left',
              }}
            >
              <div className="between" style={{ marginBottom: 6 }}>
                <span className="muted">Amount Settled</span>
                <b style={{ fontSize: 18, color: 'var(--green-dark)' }}>{inr(successData.amount)}</b>
              </div>
              <div className="between">
                <span className="muted">Payment Ref ID</span>
                <b style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ink)' }}>{successData.paymentId}</b>
              </div>
            </div>

            {/* Pill Buttons */}
            <button
              className="btn primary"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 999,
                background: '#0e3a40',
                borderColor: '#0e3a40',
                marginBottom: 10,
                color: '#fff',
              }}
              onClick={() => setSuccessData(null)}
            >
              View Cash History
            </button>

            <button
              className="btn secondary"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 999,
                background: '#f2ece1',
                color: '#222',
                border: '1px solid #e0d8c8',
              }}
              onClick={() => {
                setSuccessData(null);
                navigate('/');
              }}
            >
              Back to Home
            </button>
          </div>
        </div>
      ) : null}
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
          <Link key={n.id} to={n.link || (n.taskId ? `/task/${n.taskId}` : '#')} className="card" style={{ display: 'flex', gap: 12, opacity: n.readAt ? 0.7 : 1 }}>
            <div className="thumb" style={{ width: 42, height: 42, background: n.readAt ? 'var(--bg)' : 'var(--orange-soft)' }}>
              {n.type === 'BROADCAST' ? <img src={`${import.meta.env.BASE_URL}svv-balaji.png`} alt="" style={{ width: 30, height: 30 }} /> : <Bell size={20} />}
            </div>
            <div style={{ flex: 1 }}>
              <div className="between"><b style={{ color: 'var(--ink)', fontSize: 14 }}>{n.title}</b><span className="muted" style={{ fontSize: 11 }}>{time(n.createdAt)}</span></div>
              <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{n.body}</div>
              {n.imageUrl ? <img src={n.imageUrl} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 8 }} /> : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Profile() {
  const { rider, reload, signOut } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void reload();
  }, [reload]);

  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState(rider?.fullName ?? '');
  const [email, setEmail] = useState(rider?.email ?? '');
  const [city, setCity] = useState(rider?.city ?? '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(rider?.vehicleType ?? 'MOTORCYCLE');
  const [vehicleNumber, setVehicleNumber] = useState(rider?.vehicleNumber ?? '');
  const [maxCarryKg, setMaxCarryKg] = useState(rider?.maxCarryKg != null ? String(rider.maxCarryKg) : '');

  if (!rider) return null;

  const handlePhotoUpload = async (f: File) => {
    setUploadingPhoto(true);
    try {
      await riderApi.uploadDocument(f, 'photo');
      await reload();
      void qc.invalidateQueries();
      toast('Profile picture updated successfully!', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fullName.trim();
    if (!cleanName || !/^[a-zA-Z\s.'-]+$/.test(cleanName)) {
      toast('Full name should contain letters only', 'error');
      return;
    }
    const cleanEmail = email.trim();
    if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      toast('Enter a valid email address', 'error');
      return;
    }
    const cleanCity = city.trim();
    if (cleanCity && !/^[a-zA-Z\s.'-]+$/.test(cleanCity)) {
      toast('City should contain letters only', 'error');
      return;
    }

    const carryKg = Number(maxCarryKg);
    if (maxCarryKg.trim() && (!Number.isFinite(carryKg) || carryKg < 1 || carryKg > 500)) {
      toast('Carrying capacity must be between 1 and 500 kg', 'error');
      return;
    }

    setSaving(true);
    try {
      await riderApi.updateProfile({
        fullName: cleanName,
        email: cleanEmail || undefined,
        city: cleanCity || undefined,
        vehicleType,
        vehicleNumber: vehicleNumber.trim().toUpperCase() || undefined,
        ...(maxCarryKg.trim() ? { maxCarryKg: carryKg } : {}),
      });
      await reload();
      void qc.invalidateQueries();
      setEditing(false);
      toast('Profile updated successfully!', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const rows: Array<[string, React.ReactNode, React.ReactNode]> = [
    ['Rider ID', rider.code ?? '—', <User size={18} key="u" />],
    ['Mobile', rider.phone, <User size={18} key="p" />],
    ['Email', rider.email || '—', <User size={18} key="e" />],
    ['Store', rider.warehouse?.name ?? 'Not assigned', <Store size={18} key="s" />],
    ['Deliveries at once', rider.maxActiveTasks ?? 1, <Box size={18} key="d" />],
    ['Can carry', rider.maxCarryKg != null ? `${rider.maxCarryKg} kg` : 'Not set', <Box size={18} key="w" />],
    ['City', rider.city || '—', <User size={18} key="c" />],
    ['Vehicle', [rider.vehicleType?.replace('_', ' ').toLowerCase(), rider.vehicleNumber].filter(Boolean).join(' · ') || '—', <Truck size={18} key="t" />],
  ];

  return (
    <div className="app">
      <TopBar title="Profile" />
      <div className="page with-nav">
        <div className="card" style={{ textAlign: 'center', padding: '22px 16px' }}>
          <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--orange)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 32, fontWeight: 600, overflow: 'hidden', border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              {uploadingPhoto ? <Spinner /> : rider.photoUrl ? <img src={rider.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : rider.fullName.charAt(0)}
            </div>
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              disabled={uploadingPhoto}
              title="Change profile picture"
              style={{
                position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderRadius: '50%', background: 'var(--orange)', color: '#fff', display: 'grid', placeItems: 'center', border: '2px solid #fff', cursor: 'pointer'
              }}
            >
              <Camera size={15} />
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && void handlePhotoUpload(e.target.files[0])}
            />
          </div>

          <h2 style={{ margin: '12px 0 2px', fontSize: 18, color: 'var(--ink)' }}>{rider.fullName}</h2>
          <span className={`chip ${rider.availability === 'ONLINE' ? 'green' : 'grey'}`}>{rider.availability === 'ONLINE' ? 'Online' : 'Offline'}</span>
        </div>

        {!editing ? (
          <>
            <div className="between" style={{ padding: '8px 4px 2px' }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>Personal Information</span>
              <button className="link" style={{ fontSize: 13, fontWeight: 600 }} onClick={() => {
                setFullName(rider.fullName);
                setEmail(rider.email ?? '');
                setCity(rider.city ?? '');
                setVehicleType(rider.vehicleType ?? 'MOTORCYCLE');
                setVehicleNumber(rider.vehicleNumber ?? '');
                setMaxCarryKg(rider.maxCarryKg != null ? String(rider.maxCarryKg) : '');
                setEditing(true);
              }}>
                Edit details
              </button>
            </div>

            <div className="card" style={{ padding: '4px 16px', marginTop: 4 }}>
              {rows.map(([k, v, i], n) => (
                <div key={k} className="between" style={{ padding: '13px 0', borderTop: n ? '1px solid var(--line)' : 'none', fontSize: 14 }}>
                  <span className="row muted"><span style={{ color: 'var(--orange)' }}>{i}</span>{k}</span>
                  <b style={{ color: 'var(--ink)', textTransform: k === 'Vehicle' ? 'capitalize' : 'none' }}>{v}</b>
                </div>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={handleSaveProfile} className="card" style={{ marginTop: 8, padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 14, color: 'var(--ink)' }}>Edit Personal Details</div>

            <div className="field">
              <label>Full Name *</label>
              <input className="inp" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Enter full name" />
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Email Address</label>
              <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>City</label>
              <input className="inp" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Indore" />
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Vehicle Type</label>
              <select className="inp" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)}>
                <option value="MOTORCYCLE">Motorcycle</option>
                <option value="SCOOTER">Scooter</option>
                <option value="EV_SCOOTER">EV Scooter</option>
                <option value="BICYCLE">Bicycle</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Vehicle Number</label>
              <input className="inp" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. MP09AB1234" />
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>How much can you carry? (kg)</label>
              <input className="inp" inputMode="decimal" value={maxCarryKg} onChange={(e) => setMaxCarryKg(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} placeholder="e.g. 20" />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Orders heavier than what you have room for are not offered to you.</div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button type="button" className="btn soft block" style={{ flex: 1 }} onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn primary block" style={{ flex: 1 }} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        <div className="card" style={{ padding: '4px 16px', marginTop: 14 }}>
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
