import { ArrowLeftOutlined, CheckCircleFilled, FilterOutlined, SearchOutlined, ClockCircleFilled, CloseCircleFilled, CustomerServiceOutlined, RightOutlined, StarFilled, SyncOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Drawer, Skeleton, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkoutApi, type OrderSummaryRow } from '../api/checkout';
import { useCustomerAuth } from '../auth/CustomerAuthContext';
import { formatInr } from '../utils/money';
import { statusLabel } from './orderStatus';
import { useReorder } from './useReorder';

function EmptyOrders({
  accent,
  title,
  message,
  perks,
  cta,
  onCta,
}: {
  accent: string;
  title: string;
  message: string;
  perks?: string[];
  cta: string;
  onCta: () => void;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        padding: '8px 20px 28px',
        textAlign: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        marginTop: 8,
      }}
    >
      <div style={{ fontSize: 56, lineHeight: 1, margin: '20px 0 12px' }}>🛍️</div>
      <Typography.Title level={4} style={{ margin: '0 0 8px', color: '#0f172a', fontWeight: 700, lineHeight: 1.35 }}>
        {title}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 14, maxWidth: 400, margin: '0 auto 16px', lineHeight: 1.6 }}>
        {message}
      </Typography.Paragraph>
      {perks ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          {perks.map((p) => (
            <span
              key={p}
              style={{
                background: `${accent}14`,
                color: '#334155',
                border: `1px solid ${accent}33`,
                borderRadius: 999,
                padding: '5px 12px',
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              {p}
            </span>
          ))}
        </div>
      ) : null}
      <Button
        type="primary"
        size="large"
        onClick={onCta}
        style={{
          background: accent,
          borderColor: accent,
          borderRadius: 12,
          height: 46,
          padding: '0 28px',
          fontWeight: 600,
          boxShadow: `0 6px 16px ${accent}40`,
        }}
      >
        {cta}
      </Button>
    </div>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function statusLine(o: OrderSummaryRow): { icon: React.ReactNode; text: string; sub: string; color: string } {
  if (o.status === 'DELIVERED') {
    return {
      icon: <CheckCircleFilled />,
      text: `Delivered on ${shortDate(o.deliveredAt ?? o.placedAt)}`,
      sub: 'Your order was delivered',
      color: '#16a34a',
    };
  }
  if (o.status === 'CANCELLED') {
    return { icon: <CloseCircleFilled />, text: 'Cancelled', sub: `Ordered on ${shortDate(o.placedAt)}`, color: '#dc2626' };
  }
  return {
    icon: <ClockCircleFilled />,
    text: statusLabel(o.status, o.fulfillmentMethod),
    sub: `Ordered on ${shortDate(o.placedAt)}`,
    color: o.status === 'DISPATCHED' ? '#2563eb' : '#ea580c',
  };
}

function OrderCard({
  order: o,
  accent,
  onOpen,
  onRate,
  onReorder,
  onSupport,
}: {
  order: OrderSummaryRow;
  accent: string;
  onOpen: () => void;
  onRate: () => void;
  onReorder: () => void;
  onSupport: () => void;
}) {
  const st = statusLine(o);
  const thumbs = o.lines.slice(0, 4);
  const extra = o.lines.length - thumbs.length;
  const named = o.lines.map((l) => l.name).filter(Boolean) as string[];
  const firstName = named[0] ?? '';
  const moreCount = Math.max(0, named.length - 1);
  const delivered = o.status === 'DELIVERED';
  const canReorder = (delivered || o.status === 'CANCELLED') && o.lines.some((l) => l.available);

  return (
    <div style={{ background: '#fff', borderRadius: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <div onClick={onOpen} style={{ padding: '14px 16px', cursor: 'pointer' }}>
        {/* Status + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: `${st.color}14`,
              color: st.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {st.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text strong style={{ fontSize: 14.5, color: st.color, display: 'block', lineHeight: 1.3 }}>
              {st.text}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {st.sub}
            </Typography.Text>
          </div>
          <RightOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
        </div>

        {/* Product thumbnails */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {thumbs.map((l) => (
            <div
              key={l.productId}
              style={{
                width: 56,
                height: 56,
                borderRadius: 10,
                border: '1px solid #eef2f6',
                background: '#f8fafc',
                overflow: 'hidden',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {l.imageUrl ? (
                <img src={l.imageUrl} alt={l.name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 22 }}>🛍️</div>
              )}
              {l.quantity > 1 ? (
                <span
                  style={{
                    position: 'absolute',
                    right: 3,
                    bottom: 3,
                    background: 'rgba(15,23,42,0.75)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 6,
                    padding: '0 5px',
                    lineHeight: '16px',
                  }}
                >
                  ×{l.quantity}
                </span>
              ) : null}
            </div>
          ))}
          {extra > 0 ? (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 10,
                background: '#f1f5f9',
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#475569',
                flexShrink: 0,
              }}
            >
              +{extra}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 10, fontSize: 12.5, color: '#64748b', minWidth: 0 }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{firstName}</span>
          {moreCount > 0 ? <span style={{ whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600 }}>+ {moreCount} more</span> : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {o.itemCount} item{o.itemCount === 1 ? '' : 's'} · #{o.orderNumber}
          </Typography.Text>
          <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>
            {formatInr(o.total)}
          </Typography.Text>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', borderTop: '1px solid #f1f5f9' }}>
        <button
          onClick={onSupport}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            borderRight: '1px solid #f1f5f9',
            padding: '12px 8px',
            cursor: 'pointer',
            fontSize: 13.5,
            fontWeight: 600,
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <CustomerServiceOutlined /> Support
        </button>
        {delivered ? (
          <button
            onClick={onRate}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              borderRight: canReorder ? '1px solid #f1f5f9' : 'none',
              padding: '12px 8px',
              cursor: 'pointer',
              fontSize: 13.5,
              fontWeight: 600,
              color: o.reviewPending ? '#b45309' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <StarFilled style={{ color: '#f59e0b' }} /> {o.reviewPending ? 'Rate order' : 'Rated · Edit'}
          </button>
        ) : null}
        {canReorder ? (
          <button
            onClick={onReorder}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              padding: '12px 8px',
              cursor: 'pointer',
              fontSize: 13.5,
              fontWeight: 700,
              color: accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <SyncOutlined /> Reorder
          </button>
        ) : null}
      </div>
    </div>
  );
}


/** The customer's real orders, newest first, refreshed while any is still in progress. */
type StatusFilter = 'ALL' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED';
type TimeFilter = 'ALL' | '30' | '90' | '365';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'In progress' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const TIME_OPTIONS: Array<{ value: TimeFilter; label: string }> = [
  { value: 'ALL', label: 'Any time' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 3 months' },
  { value: '365', label: 'Last 12 months' },
];

function matchesStatus(o: OrderSummaryRow, f: StatusFilter) {
  if (f === 'ALL') return true;
  if (f === 'DELIVERED') return o.status === 'DELIVERED';
  if (f === 'CANCELLED') return o.status === 'CANCELLED';
  return o.status !== 'DELIVERED' && o.status !== 'CANCELLED';
}

function matchesTime(o: OrderSummaryRow, f: TimeFilter) {
  if (f === 'ALL') return true;
  const days = Number(f);
  return Date.now() - new Date(o.placedAt).getTime() <= days * 24 * 60 * 60 * 1000;
}

/** Every typed word must appear in the order number or one of its product names. */
function matchesSearch(o: OrderSummaryRow, text: string) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [o.orderNumber, ...o.lines.map((l) => l.name ?? '')].join(' ').toLowerCase();
  return words.every((w) => haystack.includes(w));
}

function FilterChip({ active, accent, onClick, children }: { active: boolean; accent: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px',
        borderRadius: 999,
        border: `1.5px solid ${active ? accent : '#e2e8f0'}`,
        background: active ? `${accent}14` : '#fff',
        color: active ? accent : '#334155',
        fontWeight: active ? 700 : 500,
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function FiltersSheet({
  open,
  accent,
  status,
  time,
  onClose,
  onApply,
}: {
  open: boolean;
  accent: string;
  status: StatusFilter;
  time: TimeFilter;
  onClose: () => void;
  onApply: (status: StatusFilter, time: TimeFilter) => void;
}) {
  const [s, setS] = useState<StatusFilter>(status);
  const [t, setT] = useState<TimeFilter>(time);
  useEffect(() => {
    if (open) {
      setS(status);
      setT(time);
    }
  }, [open, status, time]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height="auto"
      title={<span style={{ fontSize: 16 }}>Filter orders</span>}
      styles={{ body: { padding: 16 }, content: { borderRadius: '16px 16px 0 0' } }}
    >
      <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Order status</Typography.Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {STATUS_OPTIONS.map((o) => (
          <FilterChip key={o.value} active={s === o.value} accent={accent} onClick={() => setS(o.value)}>
            {o.label}
          </FilterChip>
        ))}
      </div>
      <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Order time</Typography.Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
        {TIME_OPTIONS.map((o) => (
          <FilterChip key={o.value} active={t === o.value} accent={accent} onClick={() => setT(o.value)}>
            {o.label}
          </FilterChip>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          size="large"
          onClick={() => {
            setS('ALL');
            setT('ALL');
          }}
          style={{ flex: 1, borderRadius: 12, fontWeight: 600 }}
        >
          Clear all
        </Button>
        <Button
          type="primary"
          size="large"
          onClick={() => onApply(s, t)}
          style={{ flex: 1, borderRadius: 12, fontWeight: 700, background: accent, borderColor: accent }}
        >
          Apply
        </Button>
      </div>
    </Drawer>
  );
}

export function OrdersPage() {
  const navigate = useNavigate();
  const { role } = useCustomerAuth();
  const isRetailer = role === 'RETAILER';
  const accent = isRetailer ? '#059669' : '#f97316';
  const reorder = useReorder();
  const orders = useQuery({
    queryKey: ['storefront', 'orders'],
    queryFn: checkoutApi.orders,
    enabled: role !== 'GUEST',
    refetchInterval: (q) => (q.state.data?.some((o) => !['DELIVERED', 'CANCELLED'].includes(o.status)) ? 20_000 : false),
  });

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [time, setTime] = useState<TimeFilter>('ALL');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const all = orders.data ?? [];
  const visible = useMemo(
    () => all.filter((o) => matchesStatus(o, status) && matchesTime(o, time) && matchesSearch(o, search)),
    [all, status, time, search],
  );
  const activeFilterCount = (status !== 'ALL' ? 1 : 0) + (time !== 'ALL' ? 1 : 0);
  const filtering = activeFilterCount > 0 || search.trim().length > 0;
  const clearAll = () => {
    setSearch('');
    setStatus('ALL');
    setTime('ALL');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      <header style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}><ArrowLeftOutlined style={{ fontSize: 20 }} /></button>
        <Typography.Text strong style={{ fontSize: 16 }}>My Orders</Typography.Text>
      </header>

      <div style={{ padding: 12, maxWidth: 720, margin: '0 auto' }}>
        {role === 'GUEST' ? (
          <EmptyOrders
            accent={accent}
            title="Your orders live here 📦"
            message="Sign in to track deliveries, reorder your favourites and see every rupee you've saved."
            cta="Sign in with OTP"
            onCta={() => navigate('/login')}
          />
        ) : orders.isLoading ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 20 }}>
            <Skeleton active />
          </div>
        ) : (orders.data ?? []).length === 0 ? (
          <EmptyOrders
            accent={accent}
            title={isRetailer ? 'No bulk orders yet 🧺' : 'No orders yet — your basket is feeling lonely! 🛒'}
            message={
              isRetailer
                ? 'Stock up your shelves with wholesale rates, GST billing and credit terms. Your first bulk order is just a few taps away.'
                : 'Fresh, farm-sourced goodies are waiting for you. Place your first order and we’ll bring it right to your doorstep.'
            }
            perks={
              isRetailer
                ? ['🏷️ Wholesale prices', '🧾 GST invoices', '🎁 Reward coins']
                : ['🌾 Farm fresh', '🚚 Doorstep delivery', '🎁 Earn reward points']
            }
            cta={isRetailer ? 'Browse wholesale catalogue' : 'Start shopping'}
            onCta={() => navigate('/')}
          />
        ) : (
          <>
            {/* Search + filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#fff',
                  border: `1px solid ${search ? accent : '#e2e8f0'}`,
                  borderRadius: 12,
                  padding: '0 12px',
                  height: 42,
                }}
              >
                <SearchOutlined style={{ color: '#94a3b8' }} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by product or order id"
                  style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14 }}
                />
                {search ? <CloseCircleFilled onClick={() => setSearch('')} style={{ color: '#94a3b8', cursor: 'pointer' }} /> : null}
              </div>
              <button
                onClick={() => setFiltersOpen(true)}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 42,
                  padding: '0 14px',
                  borderRadius: 12,
                  border: `1px solid ${activeFilterCount ? accent : '#e2e8f0'}`,
                  background: activeFilterCount ? `${accent}14` : '#fff',
                  color: activeFilterCount ? accent : '#334155',
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                }}
              >
                <Badge count={activeFilterCount} size="small" color={accent} offset={[2, -2]}>
                  <FilterOutlined style={{ color: activeFilterCount ? accent : '#334155', fontSize: 15 }} />
                </Badge>
                Filters
              </button>
            </div>

            {/* Quick status chips */}
            <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12, paddingBottom: 2 }}>
              {STATUS_OPTIONS.map((opt) => (
                <FilterChip key={opt.value} active={status === opt.value} accent={accent} onClick={() => setStatus(opt.value)}>
                  {opt.label}
                </FilterChip>
              ))}
            </div>

            {filtering ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 4px 10px', fontSize: 12.5, color: '#64748b' }}>
                <span>
                  Showing {visible.length} of {all.length} order{all.length === 1 ? '' : 's'}
                  {time !== 'ALL' ? ` · ${TIME_OPTIONS.find((t) => t.value === time)?.label}` : ''}
                </span>
                <button onClick={clearAll} style={{ background: 'none', border: 'none', color: accent, fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}>
                  Clear all
                </button>
              </div>
            ) : null}

            {visible.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 16, padding: '28px 16px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 40, lineHeight: 1 }}>🔍</div>
                <Typography.Text strong style={{ fontSize: 15.5, display: 'block', marginTop: 8 }}>
                  No orders match
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 14 }}>
                  {search.trim() ? `Nothing found for “${search.trim()}”` : 'Try a different status or time period.'}
                </Typography.Text>
                <Button onClick={clearAll} style={{ borderRadius: 10, fontWeight: 600, color: accent, borderColor: accent }}>
                  Clear search & filters
                </Button>
              </div>
            ) : (
              visible.map((o) => (
            <OrderCard
              key={o.orderNumber}
              order={o}
              accent={accent}
              onOpen={() => navigate(`/orders/${o.orderNumber}`)}
              onRate={() => navigate(`/orders/${o.orderNumber}`, { state: { focusRating: true } })}
              onReorder={() => reorder(o.lines)}
              onSupport={() => navigate(`/orders/${o.orderNumber}/support`)}
            />
              ))
            )}

            <FiltersSheet
              open={filtersOpen}
              accent={accent}
              status={status}
              time={time}
              onClose={() => setFiltersOpen(false)}
              onApply={(st, tm) => {
                setStatus(st);
                setTime(tm);
                setFiltersOpen(false);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
