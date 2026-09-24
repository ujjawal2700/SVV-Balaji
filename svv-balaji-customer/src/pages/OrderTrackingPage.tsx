import {
  ArrowLeftOutlined,
  CarOutlined,
  CheckCircleFilled,
  CopyOutlined,
  CustomerServiceOutlined,
  PhoneOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Modal, Rate, Select, Skeleton, Steps, Tag, Typography, message } from 'antd';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { checkoutApi, checkoutError, type OrderDetail } from '../api/checkout';
import type { SupportTicketCategory } from '../api/supportTickets';
import { useCreateSupportTicket } from '../hooks/useSupportTickets';
import { formatInr } from '../utils/money';
import { progressIndex, progressSteps, statusColor, statusLabel } from './orderStatus';
import { useReorder } from './useReorder';

type Item = OrderDetail['items'][number];

const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const at = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const placedOn = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' });

const paise = (rupees: number) => Math.round(rupees * 100);
const rupees = (p: number) => p / 100;

/** What a line costs the shopper at the selling price, GST included, before any order-level discount. */
const lineSellingPaise = (i: Item) => paise(i.unitPrice * i.quantity * (1 + i.gstRatePercent / 100));

interface BillRow {
  label: string;
  value: number;
  kind?: 'discount' | 'free';
}

/**
 * The bill, built only from what the server stored on the order, laid out
 * shopper-style (prices GST-inclusive, like the price tag). The rows always add
 * up to the order's own `total`: the order-level discounts are shown as what
 * they actually took off the bill, i.e. including the GST they saved.
 */
function buildBill(o: OrderDetail): { rows: BillRow[]; total: number; savings: number } {
  const itemTotal = o.items.reduce((n, i) => n + lineSellingPaise(i), 0);
  const allHaveMrp = o.items.length > 0 && o.items.every((i) => i.mrp !== null && i.mrp > 0);
  const mrpTotal = allHaveMrp ? o.items.reduce((n, i) => n + paise((i.mrp as number) * i.quantity), 0) : null;
  const productDiscount = mrpTotal !== null ? Math.max(0, mrpTotal - itemTotal) : 0;

  const fee = paise(o.totals.deliveryFee);
  const total = paise(o.totals.total);
  const orderDiscount = itemTotal + fee - total; // what coupon + coins took off, GST included

  const rows: BillRow[] = [];
  if (mrpTotal !== null && productDiscount > 0) {
    rows.push({ label: 'MRP', value: mrpTotal });
    rows.push({ label: 'Product discount', value: productDiscount, kind: 'discount' });
  }
  rows.push({ label: 'Item total', value: itemTotal });

  if (orderDiscount > 0) {
    const loyalty = o.totals.loyaltyRedeemedInr;
    const referral = o.totals.referralRedeemedInr;
    const coupon = Math.max(0, o.totals.discount - loyalty - referral);
    const parts = [
      { label: o.totals.couponCode ? `Coupon (${o.totals.couponCode})` : 'Coupon discount', amount: coupon },
      { label: `Loyalty points used${o.totals.loyaltyRedeemedPoints ? ` (${o.totals.loyaltyRedeemedPoints})` : ''}`, amount: loyalty },
      { label: `Referral coins used${o.totals.referralRedeemedPoints ? ` (${o.totals.referralRedeemedPoints})` : ''}`, amount: referral },
    ].filter((pt) => pt.amount > 0);
    const base = parts.reduce((n, pt) => n + pt.amount, 0);
    let left = orderDiscount;
    parts.forEach((pt, idx) => {
      const share = idx === parts.length - 1 ? left : Math.round((orderDiscount * pt.amount) / base);
      left -= share;
      rows.push({ label: pt.label, value: share, kind: 'discount' });
    });
    if (parts.length === 0) rows.push({ label: 'Discount', value: orderDiscount, kind: 'discount' });
  } else if (orderDiscount < 0) {
    // Only ever a paisa or two of rounding; shown rather than hidden so the bill still adds up.
    rows.push({ label: 'Rounding', value: -orderDiscount });
  }

  rows.push(fee === 0 ? { label: 'Delivery charges', value: 0, kind: 'free' } : { label: 'Delivery charges', value: fee });

  return { rows, total, savings: productDiscount + Math.max(0, orderDiscount) };
}

const HELP_TOPICS: Array<{ value: SupportTicketCategory; label: string }> = [
  { value: 'ORDER_ISSUE', label: 'Problem with an item' },
  { value: 'DELIVERY_DELAY', label: 'Delivery issue' },
  { value: 'PAYMENT_REFUND', label: 'Payment or refund' },
  { value: 'OTHER', label: 'Something else' },
];

/**
 * One order, live. Products with prices on top, then the bill and order details,
 * and a way to raise a support ticket about this exact order.
 */
export function OrderTrackingPage() {
  const { orderId: orderNumber } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const justPlaced = Boolean((location.state as { justPlaced?: boolean } | null)?.justPlaced);
  const focusRating = Boolean((location.state as { focusRating?: boolean } | null)?.focusRating);
  const reorder = useReorder();
  const [helpOpen, setHelpOpen] = useState(false);

  const handleBack = () => {
    if (justPlaced) navigate('/orders', { replace: true });
    else navigate(-1);
  };

  const order = useQuery({
    queryKey: ['storefront', 'orders', orderNumber],
    queryFn: () => checkoutApi.order(orderNumber as string),
    enabled: Boolean(orderNumber),
    retry: false,
    refetchInterval: (q) => (q.state.data && ['DELIVERED', 'CANCELLED'].includes(q.state.data.status) ? false : 15_000),
  });
  const o = order.data;
  const delivered = o?.status === 'DELIVERED';

  const copyOrderId = () => {
    if (!o) return;
    void navigator.clipboard?.writeText(o.orderNumber);
    message.success('Order id copied');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f3f6', paddingBottom: 80 }}>
      <header style={{ background: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}>
          <ArrowLeftOutlined style={{ fontSize: 20 }} />
        </button>
        <Typography.Text strong style={{ fontSize: 16 }}>Order details</Typography.Text>
      </header>

      <div style={{ padding: 12, maxWidth: 720, margin: '0 auto' }}>
        {order.isLoading ? (
          <Card>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : order.error ? (
          <Alert type="error" showIcon message={checkoutError(order.error).message} />
        ) : o ? (
          <>
            {justPlaced ? <Alert type="success" showIcon message="Thank you! Your order has been placed." style={{ marginBottom: 12, borderRadius: 12 }} /> : null}

            {/* Status */}
            {delivered ? (
              <div
                style={{
                  background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                  borderRadius: 16,
                  padding: '18px 16px',
                  marginBottom: 12,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  boxShadow: '0 6px 16px rgba(22,163,74,0.25)',
                }}
              >
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', fontSize: 24, flexShrink: 0 }}>
                  <CheckCircleFilled />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>Delivered</div>
                  <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>on {fullDate(o.deliveredAt ?? o.placedAt)}</div>
                </div>
                <Button
                  icon={<SyncOutlined />}
                  onClick={() =>
                    reorder(
                      o.items.map((i) => ({
                        productId: i.productId,
                        name: i.name,
                        imageUrl: i.imageUrl ?? null,
                        unit: i.unit,
                        mrp: i.mrp,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        available: i.available,
                      })),
                    )
                  }
                  style={{ borderRadius: 10, fontWeight: 700, color: '#15803d', border: 'none' }}
                >
                  Reorder
                </Button>
              </div>
            ) : (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Tag color={statusColor(o.status)} style={{ fontSize: 13, padding: '2px 10px' }}>{statusLabel(o.status, o.fulfillment.method)}</Tag>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Placed {at(o.placedAt)}</Typography.Text>
                </div>
                {o.status === 'CANCELLED' ? (
                  <Alert type="error" showIcon message="This order was cancelled" />
                ) : (
                  <Steps size="small" current={progressIndex(o.status)} items={progressSteps(o.fulfillment.method).map((s) => ({ title: s.label }))} />
                )}
                {o.status !== 'CANCELLED' && o.fulfillment.etaLabel ? (
                  <Typography.Text style={{ display: 'block', marginTop: 12 }}>
                    Expected delivery in about <strong>{o.fulfillment.etaLabel}</strong> of placing
                  </Typography.Text>
                ) : null}
              </Card>
            )}

            {!delivered && o.deliveryOtp ? (
              <Card>
                <div style={{ textAlign: 'center' }}>
                  <Typography.Text type="secondary"><SafetyCertificateOutlined /> Delivery OTP</Typography.Text>
                  <div style={{ fontSize: 34, letterSpacing: 10, fontWeight: 800, color: '#c2410c', margin: '4px 0' }}>{o.deliveryOtp}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Tell this code to the delivery partner at your door. Don't share it before your order arrives.</Typography.Text>
                </div>
              </Card>
            ) : null}

            {!delivered && o.rider?.name ? (
              <Card title="Your delivery partner">
                <Typography.Text strong>{o.rider.name}</Typography.Text>
                {o.rider.phone ? <div><Button type="link" icon={<PhoneOutlined />} href={`tel:${o.rider.phone}`} style={{ paddingLeft: 0 }}>{o.rider.phone}</Button></div> : null}
              </Card>
            ) : null}

            {!delivered && o.shipment ? (
              <Card title="Shipment">
                <Typography.Text style={{ display: 'block' }}><CarOutlined /> {o.shipment.courier} · AWB <strong>{o.shipment.awb}</strong></Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Status: {o.shipment.status.replace(/_/g, ' ').toLowerCase()}</Typography.Text>
                {o.shipment.trackingUrl ? <div style={{ marginTop: 8 }}><Button type="primary" href={o.shipment.trackingUrl} target="_blank" rel="noreferrer">Track shipment</Button></div> : null}
              </Card>
            ) : null}

            {/* Products, with prices - and, once delivered, their ratings */}
            <ItemsCard order={o} delivered={delivered} focusRating={focusRating} />

            <BillCard order={o} />

            {/* Order details */}
            <Card title="Order details">
              <Detail label="Order id">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {o.orderNumber}
                  <CopyOutlined onClick={copyOrderId} style={{ color: '#64748b', cursor: 'pointer' }} />
                </span>
              </Detail>
              <Detail label="Payment">
                {o.payment.mode === 'COD' ? 'Cash on delivery' : o.payment.mode === 'CREDIT' ? 'On account (credit)' : 'Paid online'}
                {o.payment.status === 'PAID' ? '' : ` · ${o.payment.status.toLowerCase()}`}
              </Detail>
              <Detail label="Deliver to">
                {o.address.fullName} · {o.address.phone}
                <br />
                {[o.address.line1, o.address.line2, o.address.landmark].filter(Boolean).join(', ')}, {o.address.city}, {o.address.state} {o.address.pincode}
              </Detail>
              <Detail label="Order placed">placed on {placedOn(o.placedAt)}</Detail>
              {delivered && o.deliveredAt ? <Detail label="Delivered">on {placedOn(o.deliveredAt)}</Detail> : null}
              <Detail label="Delivery" last>
                {o.fulfillment.method === 'LOCAL' ? 'Express local delivery' : 'Standard courier delivery'}
              </Detail>
            </Card>

            {!delivered && o.timeline.length > 0 ? (
              <Card title="Order history">
                {o.timeline.map((t, i) => {
                  const note = formatTimelineNote(t.note);
                  return (
                    <div key={`${t.type}-${i}`} style={{ fontSize: 13, marginBottom: 6 }}>
                      <strong>{statusLabel(t.type, o.fulfillment.method) === t.type ? t.type.replace(/_/g, ' ').toLowerCase() : statusLabel(t.type, o.fulfillment.method)}</strong>
                      <span style={{ color: '#64748b' }}> · {at(t.at)}{note ? ` · ${note}` : ''}</span>
                    </div>
                  );
                })}
              </Card>
            ) : null}

            {/* Help */}
            <div style={{ background: '#fff', borderRadius: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <Typography.Text strong style={{ fontSize: 16, display: 'block', padding: '16px 16px 4px' }}>
                Need help with your order?
              </Typography.Text>
              <button
                onClick={() => navigate(`/orders/${o.orderNumber}/support`)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#eff6ff', display: 'grid', placeItems: 'center', fontSize: 18, color: '#2563eb', flexShrink: 0 }}>
                  <CustomerServiceOutlined />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0f172a' }}>Chat with Desi Tokri Assistant</div>
                  <div style={{ fontSize: 12.5, color: '#64748b' }}>Get instant resolution for your order items or delivery</div>
                </div>
                <RightOutlined style={{ color: '#94a3b8' }} />
              </button>
            </div>

            <HelpModal open={helpOpen} orderNumber={o.orderNumber} onClose={() => setHelpOpen(false)} />
          </>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ items

function ItemsCard({ order: o, delivered, focusRating }: { order: OrderDetail; delivered: boolean; focusRating: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (delivered && focusRating) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [delivered, focusRating]);
  const count = o.items.reduce((n, i) => n + i.quantity, 0);
  const pending = o.items.filter((i) => !i.review).length;

  return (
    <div ref={ref} style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', scrollMarginTop: 70 }}>
      <Typography.Text strong style={{ fontSize: 16, display: 'block' }}>
        {count} item{count === 1 ? '' : 's'} in this order
      </Typography.Text>
      {delivered ? (
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          {pending > 0 ? 'Rate your experience ⭐ — your review helps other shoppers.' : 'Thanks for rating every product in this order!'}
        </Typography.Text>
      ) : null}
      {o.items.map((i, idx) => (
        <ItemRow key={i.productId} orderNumber={o.orderNumber} item={i} rateable={delivered} last={idx === o.items.length - 1} />
      ))}
    </div>
  );
}

const RATING_WORDS = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Loved it!'];

function ItemRow({ orderNumber, item, rateable, last }: { orderNumber: string; item: Item; rateable: boolean; last: boolean }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(item.review?.rating ?? 0);
  const [comment, setComment] = useState(item.review?.comment ?? '');
  const [editing, setEditing] = useState(false);

  const save = useMutation({
    mutationFn: () => checkoutApi.reviewProduct(orderNumber, { productId: item.productId, rating, comment: comment.trim() || undefined }),
    onSuccess: () => {
      message.success('Thanks for your feedback! ⭐');
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ['storefront', 'orders'] });
    },
    onError: (e) => message.error(checkoutError(e).message),
  });

  const fallback = getFallbackImage(item.name);
  const price = rupees(lineSellingPaise(item));
  const mrp = item.mrp !== null ? item.mrp * item.quantity : null;

  return (
    <div style={{ padding: '12px 0', borderBottom: last ? 'none' : '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src={item.imageUrl || fallback}
          alt={item.name ?? ''}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = fallback;
          }}
          style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid #eef2f6', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography.Text
            strong
            style={{ fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35, color: '#1e293b' }}
          >
            {item.name}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
            {item.unit ? `${item.unit} · ` : ''}Qty {item.quantity}
          </Typography.Text>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{formatInr(price)}</div>
          {mrp !== null && mrp > price ? (
            <div style={{ fontSize: 11.5, color: '#94a3b8', textDecoration: 'line-through' }}>{formatInr(mrp)}</div>
          ) : null}
        </div>
      </div>

      {rateable ? (
        <div style={{ paddingLeft: 68, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Rate
              value={rating}
              onChange={(v) => {
                setRating(v);
                setEditing(true);
              }}
              style={{ fontSize: 18, color: '#f59e0b' }}
            />
            {rating ? <Typography.Text style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>{RATING_WORDS[rating]}</Typography.Text> : null}
          </div>
          {editing && rating > 0 ? (
            <div style={{ marginTop: 8 }}>
              <Input.TextArea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell others what you liked (optional)"
                maxLength={1000}
                autoSize={{ minRows: 2, maxRows: 5 }}
                style={{ borderRadius: 10 }}
              />
              <Button type="primary" loading={save.isPending} onClick={() => save.mutate()} style={{ marginTop: 8, borderRadius: 10, fontWeight: 600 }}>
                {item.review ? 'Update review' : 'Submit review'}
              </Button>
            </div>
          ) : item.review ? (
            <div style={{ marginTop: 2 }}>
              {item.review.comment ? (
                <Typography.Text type="secondary" style={{ fontSize: 12.5, display: 'block', fontStyle: 'italic' }}>
                  “{item.review.comment}”
                </Typography.Text>
              ) : null}
              <Button type="link" size="small" onClick={() => setEditing(true)} style={{ padding: 0, fontSize: 12 }}>
                Edit review
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ bill

function BillCard({ order: o }: { order: OrderDetail }) {
  const bill = buildBill(o);
  return (
    <Card title="Bill details">
      {bill.rows.map((r) => (
        <div
          key={r.label}
          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 8, color: r.kind === 'discount' ? '#2563eb' : '#334155' }}
        >
          <span>{r.label}</span>
          <span style={{ fontWeight: r.kind === 'free' ? 600 : 500, color: r.kind === 'free' ? '#16a34a' : undefined }}>
            {r.kind === 'free' ? 'FREE' : r.kind === 'discount' ? `-${formatInr(rupees(r.value))}` : formatInr(rupees(r.value))}
          </span>
        </div>
      ))}
      <div style={{ borderTop: '1px dashed #e2e8f0', margin: '10px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
        <span>Bill total</span>
        <span>{formatInr(rupees(bill.total))}</span>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
        Includes {formatInr(o.totals.tax)} GST
      </Typography.Text>
      {bill.savings > 0 ? (
        <div style={{ marginTop: 12, background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#15803d', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
          🎉 You saved {formatInr(rupees(bill.savings))} on this order
        </div>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------ help

function HelpModal({ open, orderNumber, onClose }: { open: boolean; orderNumber: string; onClose: () => void }) {
  const create = useCreateSupportTicket();
  const [topic, setTopic] = useState<SupportTicketCategory>('ORDER_ISSUE');
  const [text, setText] = useState('');

  const submit = () => {
    const description = text.trim();
    if (description.length < 10) {
      message.warning('Please tell us a little more (at least 10 characters)');
      return;
    }
    const topicLabel = HELP_TOPICS.find((t) => t.value === topic)?.label ?? 'Help';
    create.mutate(
      { category: topic, subject: `${topicLabel} — order ${orderNumber}`, description, orderNumber },
      {
        onSuccess: (ticket) => {
          message.success(`Request ${ticket.ticketNumber} sent — our team will get back to you soon`, 5);
          setText('');
          onClose();
        },
        onError: (e) => message.error(checkoutError(e).message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={<span style={{ fontSize: 16 }}>Chat with us</span>}
      okText="Send to support"
      onOk={submit}
      confirmLoading={create.isPending}
      centered
      destroyOnClose
    >
      <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
        About order <strong>{orderNumber}</strong>. Our support team will reply on your Help &amp; Support page.
      </Typography.Text>
      <Typography.Text strong style={{ fontSize: 13 }}>What's the issue?</Typography.Text>
      <Select value={topic} onChange={setTopic} options={HELP_TOPICS} style={{ width: '100%', margin: '6px 0 12px' }} />
      <Typography.Text strong style={{ fontSize: 13 }}>Tell us more</Typography.Text>
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. One packet was damaged when it arrived"
        maxLength={2000}
        autoSize={{ minRows: 4, maxRows: 8 }}
        style={{ marginTop: 6, borderRadius: 10 }}
      />
      <Link to="/support" style={{ fontSize: 12, display: 'inline-block', marginTop: 8 }}>
        View my earlier requests
      </Link>
    </Modal>
  );
}

// ------------------------------------------------------------------ bits

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      {title ? <Typography.Text strong style={{ fontSize: 16, display: 'block', marginBottom: 12 }}>{title}</Typography.Text> : null}
      {children}
    </div>
  );
}

function Detail({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 12 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: '#0f172a', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function getFallbackImage(name?: string | null): string {
  if (!name) return '/images/cat_namkeen.jpg';
  const lower = name.toLowerCase();
  if (lower.includes('atta') || lower.includes('flour') || lower.includes('chakki') || lower.includes('maida') || lower.includes('suji') || lower.includes('rava')) {
    return '/images/cat_atta_flour.jpg';
  }
  if (lower.includes('spice') || lower.includes('masala') || lower.includes('cardamom') || lower.includes('pepper') || lower.includes('clove') || lower.includes('dalchini') || lower.includes('haldi') || lower.includes('chilli') || lower.includes('turmeric') || lower.includes('coriander') || lower.includes('cumin') || lower.includes('jeera')) {
    return '/images/cat_spices.jpg';
  }
  if (lower.includes('wafer') || lower.includes('chip') || lower.includes('crisp')) return '/images/cat_wafers.jpg';
  if (lower.includes('bhujia') || lower.includes('aloo')) return '/images/aloo_bhujia.jpg';
  return '/images/cat_namkeen.jpg';
}

function formatTimelineNote(note: string | null | undefined): string | null {
  if (!note) return null;
  if (note.includes('SHIPROCKET') || note.includes('Main Store')) return 'Standard Courier Delivery';
  if (note.includes('LOCAL')) return 'Express Local Delivery';
  return note.replace(/Shiprocket/gi, 'Courier Partner');
}
